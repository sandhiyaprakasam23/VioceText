import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Copy,
  Check,
  Share2,
  Volume2,
  Cpu,
  Globe,
  FileDown,
  Layers,
  ArrowRight,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { EngineType, Transcription, UserSettings, SUPPORTED_LANGUAGES } from '../types';
import { WS_BASE_URL, createTranscription, uploadAudio, getOrCreateSessionId, getExportUrl } from '../services/api';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useWebSpeech } from '../hooks/useWebSpeech';
import { AudioPlayer } from '../components/AudioPlayer';
import { TextToSpeechPlayer } from '../components/TextToSpeechPlayer';
import { ShareModal } from '../components/ShareModal';
import { AiAssistantPanel } from '../components/AiAssistantPanel';

interface RecordPageProps {
  settings: UserSettings;
  onNavigateToHistory: () => void;
  onNavigateToSettings: () => void;
}

export const RecordPage: React.FC<RecordPageProps> = ({
  settings,
  onNavigateToHistory,
  onNavigateToSettings,
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState(settings.default_language || 'en-IN');
  const [activeEngine, setActiveEngine] = useState<EngineType>(settings.default_engine || 'gemini-live');
  const [engineFallbackNotice, setEngineFallbackNotice] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [savedTranscription, setSavedTranscription] = useState<Transcription | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [langPickerOpen, setLangPickerOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Sync with settings
  useEffect(() => {
    setSelectedLanguage(settings.default_language);
    setActiveEngine(settings.default_engine);
  }, [settings]);

  // Audio chunk callback to stream 16kHz PCM chunks over WebSocket to backend
  const handlePcmChunk = useCallback((pcmBytes: Uint8Array) => {
    if (activeEngine === 'gemini-live' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcmBytes.buffer);
    }
  }, [activeEngine]);

  // Hook for audio recording, AnalyserNode waveform, and MediaRecorder
  const {
    recordingState,
    duration,
    audioLevel,
    error: micError,
    startRecording: startMic,
    pauseRecording: pauseMic,
    resumeRecording: resumeMic,
    stopRecording: stopMic,
  } = useAudioRecorder({
    onAudioChunk: handlePcmChunk,
  });

  // Web Speech Fallback / Alternative Hook
  const {
    isSupported: isWebSpeechSupported,
    startListening: startWebSpeech,
    stopListening: stopWebSpeech,
    resetTranscript: resetWebSpeech,
  } = useWebSpeech({
    language: selectedLanguage,
    onTranscriptUpdate: (text) => {
      setLiveTranscript(text);
    },
  });

  // Auto-scroll transcript box
  useEffect(() => {
    if (!isEditingTranscript) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveTranscript, isEditingTranscript]);

  // Connect / Manage WebSocket for Gemini Live API
  const connectGeminiWebSocket = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      const sessionId = getOrCreateSessionId();
      const wsUrl = `${WS_BASE_URL}?session_id=${sessionId}&language=${selectedLanguage}&engine=gemini-live`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        wsRef.current = ws;
        ws.send(JSON.stringify({
          action: 'start',
          language: selectedLanguage,
          engine: 'gemini-live',
        }));
        resolve(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'transcript') {
            setLiveTranscript((prev) => (prev ? prev + ' ' + data.text : data.text));
          } else if (data.type === 'fallback_notice') {
            setEngineFallbackNotice(data.message);
            // Seamlessly switch to Web Speech fallback
            setActiveEngine('browser-webspeech');
            startWebSpeech(selectedLanguage);
          }
        } catch {
          // Binary message or non-JSON
        }
      };

      ws.onerror = () => {
        setEngineFallbackNotice('Gemini Live WebSocket connection notice. Switching to browser Web Speech fallback.');
        setActiveEngine('browser-webspeech');
        startWebSpeech(selectedLanguage);
        resolve(false);
      };

      ws.onclose = () => {
        wsRef.current = null;
      };
    });
  }, [selectedLanguage, startWebSpeech]);

  // START RECORDING
  const handleStartRecording = async () => {
    setLiveTranscript('');
    setSavedTranscription(null);
    setEngineFallbackNotice(null);
    resetWebSpeech();

    // 1. Start audio capture & visualizer
    const micStarted = await startMic();
    if (!micStarted) return;

    // 2. Start speech recognition engine
    if (activeEngine === 'gemini-live') {
      await connectGeminiWebSocket();
    } else {
      startWebSpeech(selectedLanguage);
    }
  };

  // STOP RECORDING
  const handleStopRecording = async () => {
    // 1. Stop mic and get recorded audio blob
    const { audioBlob, duration: finalDuration } = await stopMic();

    // 2. Stop speech engines
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ action: 'stop' }));
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    stopWebSpeech();

    // 3. Auto-copy to clipboard if enabled
    if (settings.auto_copy_on_stop && liveTranscript.trim()) {
      navigator.clipboard.writeText(liveTranscript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }

    // 4. Save to backend database
    if (settings.auto_save && liveTranscript.trim()) {
      try {
        setIsSaving(true);
        const saved = await createTranscription({
          text: liveTranscript.trim(),
          language: selectedLanguage,
          engine: activeEngine,
          duration_seconds: finalDuration,
        });

        // Upload audio file if recorded & enabled
        if (settings.save_audio && audioBlob) {
          try {
            const withAudio = await uploadAudio(saved.id, audioBlob);
            setSavedTranscription(withAudio);
          } catch (audioErr) {
            console.error('Audio upload notice:', audioErr);
            setSavedTranscription(saved);
          }
        } else {
          setSavedTranscription(saved);
        }
      } catch (err) {
        console.error('Failed to auto-save transcription:', err);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Toggle Recording via Mic Button or Spacebar
  const toggleRecording = () => {
    if (recordingState === 'recording' || recordingState === 'paused') {
      handleStopRecording();
    } else if (recordingState === 'idle') {
      handleStartRecording();
    }
  };

  // Keyboard shortcut listener: Space = start/stop, C = copy, S = share
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA';
      if (isInput) return;

      if (e.code === 'Space') {
        e.preventDefault();
        toggleRecording();
      } else if (e.key === 'c' || e.key === 'C') {
        if (liveTranscript) {
          navigator.clipboard.writeText(liveTranscript);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } else if (e.key === 's' || e.key === 'S') {
        if (savedTranscription) {
          setShowShareModal(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recordingState, liveTranscript, savedTranscription]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage) || SUPPORTED_LANGUAGES[0];

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-6 pb-20">
      {/* Toast Feedback */}
      {copied && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-cyber-primary text-black font-semibold px-4 py-2 rounded-full shadow-cyan-glow flex items-center gap-2 text-xs">
          <Check className="w-4 h-4" />
          <span>Copied to clipboard!</span>
        </div>
      )}

      {/* Main Glassmorphism Centerpiece Card */}
      <div className="w-full max-w-xl bg-cyber-card/90 border border-cyber-primary/30 rounded-28 p-6 md:p-8 backdrop-blur-xl shadow-cyan-glow corner-bracket flex flex-col items-center text-center relative overflow-hidden">
        {/* Top Header */}
        <div className="space-y-1 mb-5">
          <h1 className="text-xl md:text-2xl font-extrabold uppercase tracking-widest text-cyber-text">
            REAL-TIME TRANSCRIPTION
          </h1>
          <p className="text-xs text-cyber-muted font-mono tracking-wide">Live audio to text</p>
        </div>

        {/* Language Pill Chip (English · Tamil) */}
        <div className="relative mb-6">
          <button
            onClick={() => setLangPickerOpen(!langPickerOpen)}
            className="px-4 py-1.5 rounded-full bg-cyan-950/60 border border-cyber-primary text-cyber-text text-xs font-mono flex items-center gap-2 shadow-cyan-glow-sm hover:border-cyber-accent transition-all"
          >
            <Globe className="w-3.5 h-3.5 text-cyber-primary" />
            <span className="font-semibold">{currentLangObj.label} · {currentLangObj.native}</span>
          </button>

          {/* Language Picker Dropdown */}
          {langPickerOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-30 bg-cyber-bg/95 border border-cyber-primary/50 rounded-2xl p-2 shadow-cyan-glow-lg min-w-[220px] text-left font-mono text-xs">
              <p className="px-3 py-1 text-[10px] uppercase text-cyber-muted tracking-wider border-b border-cyber-primary/20 mb-1">
                Select Spoken Language
              </p>
              {SUPPORTED_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setSelectedLanguage(l.code);
                    setLangPickerOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 rounded-xl text-left flex items-center justify-between transition-colors ${
                    selectedLanguage === l.code ? 'bg-cyber-primary/20 text-cyber-primary font-bold' : 'text-cyber-text/80 hover:bg-cyber-primary/10'
                  }`}
                >
                  <span>{l.label}</span>
                  <span className="text-[11px] text-cyber-muted">{l.native}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Engine Badge & Fallback Warning */}
        <div className="flex flex-col items-center gap-1.5 mb-5">
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-cyber-muted">Engine:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-black/50 border border-cyber-primary/30 text-cyber-primary flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              <span>{activeEngine === 'gemini-live' ? '⚡ Gemini Live API' : '🌐 Browser Web Speech'}</span>
            </span>
          </div>
          {engineFallbackNotice && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-300 bg-amber-950/40 border border-amber-500/30 px-3 py-1 rounded-xl">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{engineFallbackNotice}</span>
            </div>
          )}
        </div>

        {/* Glowing Symmetrical Waveform Frame */}
        <div className="w-full max-w-md h-28 bg-black/40 border border-cyber-primary/25 rounded-24 p-3 relative flex items-center justify-center gap-1.5 mb-5 overflow-hidden">
          {/* Subtle grid in visualizer box */}
          <div className="absolute inset-0 cyber-grid opacity-30 pointer-events-none" />

          {/* Symmetrical audio bars */}
          {audioLevel.map((lvl, index) => {
            const isRecording = recordingState === 'recording';
            const barHeight = isRecording ? lvl : 15;
            return (
              <div
                key={index}
                className="w-1.5 md:w-2 rounded-full bg-gradient-to-t from-cyber-primaryDark to-cyber-primary transition-all duration-75 shadow-cyan-glow-sm"
                style={{
                  height: `${barHeight}%`,
                  opacity: isRecording ? 0.95 : 0.25,
                }}
              />
            );
          })}
        </div>

        {/* Thin Cyan Progress / Seek Bar with Timestamps */}
        <div className="w-full max-w-md mb-8">
          <div className="relative w-full h-1 bg-cyan-950 rounded-full overflow-hidden flex items-center">
            <div
              className="h-full bg-cyber-primary transition-all duration-200"
              style={{ width: `${Math.min(100, (duration / 90) * 100)}%` }}
            />
            {/* Glowing dot */}
            <div
              className="absolute w-2.5 h-2.5 rounded-full bg-cyber-accent shadow-cyan-glow top-1/2 -translate-y-1/2"
              style={{ left: `calc(${Math.min(98, (duration / 90) * 100)}% - 4px)` }}
            />
          </div>
          <div className="flex justify-between items-center text-xs font-mono text-cyber-muted mt-2">
            <span className="text-cyber-primary">{formatTimer(duration)}</span>
            <span>{recordingState === 'recording' ? 'LIVE' : 'MAX 01:30'}</span>
          </div>
        </div>

        {/* Large Circular Glowing Mic Button */}
        <div className="relative flex flex-col items-center gap-3">
          <button
            onClick={toggleRecording}
            className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center transition-all ${
              recordingState === 'recording'
                ? 'bg-red-500/20 border-2 border-red-500 text-red-400 glow-ring-active animate-pulse'
                : 'bg-cyber-primary/20 hover:bg-cyber-primary/30 border-2 border-cyber-primary text-cyber-primary glow-ring'
            }`}
            title={recordingState === 'recording' ? 'Stop recording' : 'Start recording'}
          >
            {recordingState === 'recording' ? (
              <MicOff className="w-8 h-8 md:w-10 md:h-10 text-red-400" />
            ) : (
              <Mic className="w-8 h-8 md:w-10 md:h-10 text-cyber-primary" />
            )}
          </button>

          <span className="text-xs font-mono uppercase tracking-widest text-cyber-text">
            {recordingState === 'recording'
              ? 'Stop recording'
              : recordingState === 'connecting'
              ? 'Connecting...'
              : 'Start recording'}
          </span>

          {/* Pause / Resume Controls during recording */}
          {recordingState === 'recording' && (
            <button
              onClick={pauseMic}
              className="px-3 py-1 rounded-xl bg-black/40 border border-cyber-primary/30 text-cyber-muted hover:text-cyber-primary text-xs flex items-center gap-1"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          )}
          {recordingState === 'paused' && (
            <button
              onClick={resumeMic}
              className="px-3 py-1 rounded-xl bg-cyber-primary/20 border border-cyber-primary text-cyber-primary text-xs flex items-center gap-1 animate-pulse"
            >
              <Play className="w-3.5 h-3.5 fill-cyber-primary" />
              <span>Resume</span>
            </button>
          )}
        </div>

        {/* Mic Error Banner */}
        {micError && (
          <p className="mt-4 text-xs font-mono text-red-400 bg-red-950/40 p-2 rounded-xl border border-red-500/30">
            {micError}
          </p>
        )}
      </div>

      {/* Live Transcript Display Box */}
      <div className="w-full max-w-xl bg-cyber-card/85 border border-cyber-primary/25 rounded-28 p-5 backdrop-blur-md shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-cyber-primary/15">
          <div className="flex items-center gap-2 text-xs font-mono text-cyber-muted">
            <span className="w-2 h-2 rounded-full bg-cyber-primary animate-ping" />
            <span>Live Transcript Stream</span>
          </div>
          {liveTranscript && (
            <div className="flex items-center gap-2">
              <TextToSpeechPlayer text={liveTranscript} language={selectedLanguage} />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(liveTranscript);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="p-1 text-cyber-muted hover:text-cyber-primary transition-colors"
                title="Copy live text"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        {/* Text Area */}
        <textarea
          value={liveTranscript}
          onChange={(e) => {
            setIsEditingTranscript(true);
            setLiveTranscript(e.target.value);
          }}
          placeholder="Press the microphone button to start transcribing live speech... Multilingual Tamil, English, Hindi code-mixing will appear here in real time."
          rows={5}
          className="w-full bg-black/40 border border-cyber-primary/20 rounded-2xl p-4 font-mono text-xs md:text-sm text-cyber-text leading-relaxed placeholder:text-cyber-muted/50 focus:outline-none focus:border-cyber-primary resize-y"
        />
        <div ref={transcriptEndRef} />

        {isSaving && (
          <p className="text-xs font-mono text-cyber-accent animate-pulse flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
            <span>Saving transcription & uploading audio file...</span>
          </p>
        )}
      </div>

      {/* Post-Recording Action & AI Assistant Section */}
      {savedTranscription && (
        <div className="w-full max-w-xl space-y-4 animate-fade-in">
          {/* Success Banner */}
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-24 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-300">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Session saved to History database!</span>
            </div>
            <button
              onClick={() => setShowShareModal(true)}
              className="px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-mono flex items-center gap-1 hover:bg-emerald-500/30 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
          </div>

          {/* Audio Player if available */}
          {savedTranscription.audio_url && (
            <AudioPlayer src={savedTranscription.audio_url} title={savedTranscription.title} />
          )}

          {/* AI Assistant Panel */}
          <AiAssistantPanel
            transcription={savedTranscription}
            onUpdate={(updated) => setSavedTranscription(updated)}
          />
        </div>
      )}

      {/* Keyboard Shortcuts Hint Bar */}
      <div className="flex items-center gap-3 text-[11px] font-mono text-cyber-muted/70 bg-black/30 border border-cyber-primary/15 px-4 py-2 rounded-full">
        <span>[Space] Record/Stop</span>
        <span>•</span>
        <span>[C] Copy</span>
        <span>•</span>
        <span>[S] Share</span>
        <span>•</span>
        <span>[/] Search</span>
      </div>

      {/* Share Modal */}
      {showShareModal && savedTranscription && (
        <ShareModal
          transcription={savedTranscription}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          onUpdate={(updated) => setSavedTranscription(updated)}
        />
      )}
    </div>
  );
};
