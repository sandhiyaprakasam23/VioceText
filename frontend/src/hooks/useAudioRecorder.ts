import { useState, useRef, useCallback, useEffect } from 'react';
import { RecordingState } from '../types';

export function useAudioRecorder({
  onAudioChunk,
}: {
  onAudioChunk?: (pcmBytes: Uint8Array) => void;
}) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState<number[]>(new Array(16).fill(15));
  const [error, setError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const updateVisualizer = useCallback(() => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Group into 16 symmetrical bar values
    const barsCount = 16;
    const step = Math.floor(dataArray.length / barsCount) || 1;
    const values: number[] = [];

    for (let i = 0; i < barsCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j] || 0;
      }
      const avg = sum / step;
      // Scale between 15% and 100% height
      const percentage = Math.max(15, Math.min(100, Math.round((avg / 255) * 100)));
      values.push(percentage);
    }

    setAudioLevel(values);
    animFrameRef.current = requestAnimationFrame(updateVisualizer);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setRecordingState('connecting');
      setError(null);
      audioChunksRef.current = [];
      setDuration(0);

      // 1. Get user media microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 2. Setup Web Audio API Analyser for live waveform
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      sourceNode.connect(analyser);

      // 3. Audio chunk extraction for live WebSocket PCM stream (16kHz, 16-bit mono)
      const bufferSize = 2048;
      const scriptProcessor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      // Downsample to 16kHz linear PCM
      const targetRate = 16000;
      const sampleStep = Math.max(1, Math.round(audioCtx.sampleRate / targetRate));

      scriptProcessor.onaudioprocess = (e) => {
        if (recordingState === 'paused') return;
        const inputData = e.inputBuffer.getChannelData(0);
        const outputLength = Math.floor(inputData.length / sampleStep);
        const pcm16 = new Int16Array(outputLength);
        for (let i = 0, j = 0; i < inputData.length && j < outputLength; i += sampleStep, j++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        if (onAudioChunk) {
          onAudioChunk(new Uint8Array(pcm16.buffer));
        }
      };

      // Connect through a zero-gain node to satisfy Chrome WebAudio pipeline without feedback
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      sourceNode.connect(scriptProcessor);
      scriptProcessor.connect(muteGain);
      muteGain.connect(audioCtx.destination);

      // 4. Setup MediaRecorder for final audio recording capture
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250); // collect chunk every 250ms

      // 5. Start timer
      timerIntervalRef.current = window.setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

      // 6. Start visualizer loop
      updateVisualizer();

      setRecordingState('recording');
      return true;
    } catch (err: any) {
      console.error('Error starting audio recorder:', err);
      setError(err?.message || 'Could not access microphone.');
      setRecordingState('error');
      return false;
    }
  }, [onAudioChunk, recordingState, updateVisualizer]);

  const pauseRecording = useCallback(() => {
    if (recordingState !== 'recording') return;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      audioContextRef.current.suspend();
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setRecordingState('paused');
  }, [recordingState]);

  const resumeRecording = useCallback(() => {
    if (recordingState !== 'paused') return;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    timerIntervalRef.current = window.setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    setRecordingState('recording');
  }, [recordingState]);

  const stopRecording = useCallback((): Promise<{ audioBlob: Blob | null; duration: number }> => {
    return new Promise((resolve) => {
      setRecordingState('processing');

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      setAudioLevel(new Array(16).fill(15));

      const finalize = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const blob = audioChunksRef.current.length > 0
          ? new Blob(audioChunksRef.current, { type: mimeType })
          : null;

        // Cleanup audio context and tracks
        if (scriptProcessorRef.current) {
          scriptProcessorRef.current.disconnect();
          scriptProcessorRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }

        setRecordingState('idle');
        resolve({ audioBlob: blob, duration });
      };

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = () => {
          finalize();
        };
        try {
          mediaRecorderRef.current.stop();
        } catch {
          finalize();
        }
      } else {
        finalize();
      }
    });
  }, [duration]);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    recordingState,
    duration,
    audioLevel,
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  };
}
