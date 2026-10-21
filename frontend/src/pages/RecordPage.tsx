import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Sparkles,
  Copy,
  Check,
  Share2,
  Volume2,
  Cpu,
  Globe,
  FileDown,
  Save,
  Download,
  AlertTriangle,
  Search,
  X,
  FileText,
  Clock,
  ArrowRight,
  Upload,
  Key,
  ExternalLink,
} from 'lucide-react';
import { EngineType, Transcription, UserSettings, SUPPORTED_LANGUAGES, LanguageOption } from '../types';
import {
  WS_BASE_URL,
  createTranscription,
  uploadAudio,
  getOrCreateSessionId,
  getExportUrl,
  transcribeAudioFile,
  updateTranscription,
  getStoredGeminiKey,
  setStoredGeminiKey,
} from '../services/api';
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
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState(
    settings.default_language && settings.default_language !== 'en-IN' ? settings.default_language : 'ta-IN'
  );
  const [activeEngine, setActiveEngine] = useState<EngineType>(settings.default_engine || 'browser-webspeech');
  const [engineFallbackNotice, setEngineFallbackNotice] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [savedTranscription, setSavedTranscription] = useState<Transcription | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [geminiModalOpen, setGeminiModalOpen] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState(getStoredGeminiKey());

  const wsRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Sync with user settings
  useEffect(() => {
    if (settings.default_language) setSelectedLanguage(settings.default_language);
    if (settings.default_engine) setActiveEngine(settings.default_engine);
  }, [settings]);

  // Audio chunk callback to stream 16kHz PCM chunks over WebSocket to backend (only for Gemini Live)
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
    onAudioChunk: activeEngine === 'gemini-live' ? handlePcmChunk : undefined,
  });

  // Web Speech Hook for Live Speech-to-Text
  const {
    isListening: isWebSpeechListening,
    isSpeaking: isWebSpeechSpeaking,
    error: webSpeechError,
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
      const geminiKey = getStoredGeminiKey();
      const wsUrl = `${WS_BASE_URL}?session_id=${sessionId}&language=${selectedLanguage}&engine=gemini-live${geminiKey ? `&gemini_key=${encodeURIComponent(geminiKey)}` : ''}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        wsRef.current = ws;
        ws.send(JSON.stringify({
          action: 'start',
          language: selectedLanguage,
          engine: 'gemini-live',
          gemini_key: geminiKey || undefined,
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
          }
        } catch {}
      };

      ws.onerror = () => {
        setEngineFallbackNotice('Gemini Live WebSocket notice. Seamlessly using Web Speech API.');
        resolve(false);
      };

      ws.onclose = () => {
        wsRef.current = null;
      };
    });
  }, [selectedLanguage]);

  // START RECORDING
  const handleStartRecording = async () => {
    setLiveTranscript('');
    setSavedTranscription(null);
    setRecordedAudioBlob(null);
    setRecordedAudioUrl(null);
    setEngineFallbackNotice(null);
    setSessionTitle('');
    resetWebSpeech();

    // 1. Immediately start Web Speech API for real-time speech transcription
    startWebSpeech(selectedLanguage);

    // 2. Start microphone recording & waveform (safe try/catch so speech recognition never fails)
    try {
      await startMic();
    } catch (e) {
      console.warn('Mic recorder stream notice:', e);
    }

    // 3. Connect to Gemini Live if selected
    if (activeEngine === 'gemini-live') {
      await connectGeminiWebSocket();
    }
  };

  // STOP RECORDING
  const handleStopRecording = async () => {
    stopWebSpeech();
    const { audioBlob, duration: finalDuration } = await stopMic();

    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ action: 'stop' }));
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    if (audioBlob) {
      setRecordedAudioBlob(audioBlob);
      const url = URL.createObjectURL(audioBlob);
      setRecordedAudioUrl(url);
    }

    let currentText = liveTranscript.trim();

    // If live transcript is empty and audio was captured, automatically convert audio to text via Gemini!
    if (!currentText && audioBlob) {
      const storedKey = getStoredGeminiKey();
      if (storedKey) {
        try {
          setIsTranscribingAudio(true);
          showToast('🔄 Converting audio to text with Gemini AI...');
          const res = await transcribeAudioFile(audioBlob, selectedLanguage, storedKey);
          if (res && res.text) {
            currentText = res.text;
            setLiveTranscript(res.text);
            showToast('✓ Audio converted to text!');
          }
        } catch (err) {
          console.warn('Auto audio-to-text error:', err);
        } finally {
          setIsTranscribingAudio(false);
        }
      }
    }

    if (settings.auto_copy_on_stop && currentText) {
      navigator.clipboard.writeText(currentText);
      showToast('Copied to clipboard!');
    }

    // Auto-save if enabled
    if (settings.auto_save && currentText) {
      await performSave(currentText, audioBlob, finalDuration);
    }
  };

  // Convert audio file directly into text with Gemini AI
  const handleConvertAudioToText = async () => {
    if (!recordedAudioBlob) {
      showToast('No audio recording found to convert!');
      return;
    }
    const storedKey = getStoredGeminiKey();
    if (!storedKey) {
      setGeminiModalOpen(true);
      return;
    }
    try {
      setIsTranscribingAudio(true);
      showToast('🔄 Converting audio to text with Gemini AI...');
      const res = await transcribeAudioFile(recordedAudioBlob, selectedLanguage, storedKey);
      if (res && res.text) {
        setLiveTranscript(res.text);
        showToast('✓ Audio converted to text successfully!');
        if (savedTranscription) {
          const updated = await updateTranscription(savedTranscription.id, { text: res.text });
          setSavedTranscription(updated);
        } else if (settings.auto_save) {
          await performSave(res.text, recordedAudioBlob);
        }
      } else {
        showToast('No speech detected in this audio recording.');
      }
    } catch (err: any) {
      console.warn('Audio-to-text error:', err);
      showToast('Audio conversion notice: ' + (err?.message || 'Server processing'));
    } finally {
      setIsTranscribingAudio(false);
    }
  };

  // Upload an existing audio file (.mp3, .wav, .m4a, .webm) and convert to text
  const handleAudioFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRecordedAudioBlob(file);
    const url = URL.createObjectURL(file);
    setRecordedAudioUrl(url);

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setSessionTitle(baseName);

    const storedKey = getStoredGeminiKey();
    if (!storedKey) {
      showToast('Audio file loaded! Please add your Gemini API Key to convert to text.');
      setGeminiModalOpen(true);
      return;
    }

    try {
      setIsTranscribingAudio(true);
      showToast('🔄 Converting uploaded audio to text with Gemini AI...');
      const res = await transcribeAudioFile(file, selectedLanguage, storedKey);
      if (res && res.text) {
        setLiveTranscript(res.text);
        showToast('✓ Audio converted to text successfully!');
        if (settings.auto_save) {
          await performSave(res.text, file, 0);
        }
      } else {
        showToast('No speech detected in uploaded audio.');
      }
    } catch (err: any) {
      showToast('Audio conversion notice: ' + (err?.message || 'Server error'));
    } finally {
      setIsTranscribingAudio(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportPdf = async () => {
    if (!liveTranscript.trim()) {
      showToast('No transcript text to export yet!');
      return;
    }
    try {
      showToast('Generating PDF...');
      let id = savedTranscription?.id;
      if (!id) {
        const saved = await createTranscription({
          title: sessionTitle.trim() || undefined,
          text: liveTranscript.trim(),
          language: selectedLanguage,
          engine: activeEngine,
          duration_seconds: duration,
        });
        setSavedTranscription(saved);
        id = saved.id;
      }
      const pdfUrl = getExportUrl(id, 'pdf');
      window.open(pdfUrl, '_blank');
    } catch (err: any) {
      showToast('PDF export notice: ' + (err?.message || 'Server error'));
    }
  };

  // MANUAL SAVE FUNCTION (Can be called anytime by clicking "Save Recording")
  const performSave = async (textToSave = liveTranscript, blobToSave = recordedAudioBlob, dur = duration) => {
    if (!textToSave.trim()) {
      showToast('No transcript text to save yet!');
      return;
    }

    try {
      setIsSaving(true);
      const payload: Partial<Transcription> = {
        title: sessionTitle.trim() || undefined,
        text: textToSave.trim(),
        language: selectedLanguage,
        engine: activeEngine,
        duration_seconds: dur,
      };

      const saved = await createTranscription(payload);

      if (blobToSave) {
        try {
          const withAudio = await uploadAudio(saved.id, blobToSave);
          setSavedTranscription(withAudio);
        } catch {
          setSavedTranscription(saved);
        }
      } else {
        setSavedTranscription(saved);
      }
      showToast('✓ Recording & Transcript saved to History!');
    } catch (err: any) {
      console.error('Failed to save transcription:', err);
      showToast('Failed to save recording: ' + (err?.message || 'Server error'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleRecording = () => {
    if (recordingState === 'recording' || recordingState === 'paused') {
      handleStopRecording();
    } else if (recordingState === 'idle') {
      handleStartRecording();
    }
  };

  const handleCopy = () => {
    if (!liveTranscript.trim()) return;
    navigator.clipboard.writeText(liveTranscript);
    showToast('Copied to clipboard!');
  };

  const handleDownloadLocalAudio = () => {
    if (!recordedAudioBlob) return;
    const url = URL.createObjectURL(recordedAudioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Audio download started');
  };

  const handleDownloadText = () => {
    if (!liveTranscript.trim()) return;
    const blob = new Blob([liveTranscript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Transcript downloaded (.txt)');
  };

  const currentLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage) || SUPPORTED_LANGUAGES[0];

  const quickLanguages = [
    { code: 'ta-IN', label: 'Tamil', native: 'தமிழ்' },
    { code: 'multilingual', label: 'All / Mixed', native: 'தமிழ் + Eng' },
    { code: 'en-IN', label: 'English', native: 'English' },
    { code: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
    { code: 'te-IN', label: 'Telugu', native: 'తెలుగు' },
    { code: 'ml-IN', label: 'Malayalam', native: 'മലയാളம்' },
  ];

  const handleSelectLanguage = (code: string) => {
    setSelectedLanguage(code);
    if (recordingState === 'recording' || isWebSpeechListening) {
      startWebSpeech(code);
      showToast(`Language switched to ${code}`);
    }
  };

  const filteredLanguages = SUPPORTED_LANGUAGES.filter(
    (l) =>
      l.label.toLowerCase().includes(langSearch.toLowerCase()) ||
      l.native.toLowerCase().includes(langSearch.toLowerCase()) ||
      l.code.toLowerCase().includes(langSearch.toLowerCase())
  );

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-6 pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-cyber-primary text-black font-semibold px-4 py-2 rounded-full shadow-cyan-glow flex items-center gap-2 text-xs animate-bounce">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Glassmorphism Centerpiece Card */}
      <div className="w-full max-w-xl bg-cyber-card/90 border border-cyber-primary/30 rounded-28 p-6 md:p-8 backdrop-blur-xl shadow-cyan-glow corner-bracket flex flex-col items-center text-center relative overflow-hidden">
        {/* Top Header */}
        <div className="space-y-1 mb-4">
          <h1 className="text-xl md:text-2xl font-extrabold uppercase tracking-widest text-cyber-text">
            REAL-TIME TRANSCRIPTION
          </h1>
          <p className="text-xs text-cyber-muted font-mono tracking-wide">Live Multilingual Audio to Text</p>
        </div>

        {/* Quick Language Selection Chips Bar */}
        <div className="w-full flex flex-col items-center gap-2 mb-4">
          <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-lg">
            {quickLanguages.map((l) => (
              <button
                key={l.code}
                onClick={() => handleSelectLanguage(l.code)}
                className={`px-3 py-1 rounded-full text-xs font-mono transition-all flex items-center gap-1.5 ${
                  selectedLanguage === l.code
                    ? 'bg-cyber-primary text-black font-bold shadow-cyan-glow-sm'
                    : 'bg-black/50 border border-cyber-primary/30 text-cyber-muted hover:text-cyber-primary hover:border-cyber-primary'
                }`}
              >
                <span>{l.label}</span>
                <span className="text-[10px] opacity-80">({l.native})</span>
              </button>
            ))}

            <button
              onClick={() => setLangModalOpen(true)}
              className="px-3 py-1 rounded-full text-xs font-mono bg-cyan-950/70 border border-cyber-accent text-cyber-accent hover:bg-cyan-900/60 transition-colors flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>More Languages ({SUPPORTED_LANGUAGES.length})</span>
            </button>
          </div>
        </div>

        {/* Engine Switcher & Status */}
        <div className="flex flex-col items-center gap-2 mb-5">
          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono">
            <span className="text-cyber-muted">Engine:</span>
            <button
              onClick={() => setActiveEngine(activeEngine === 'gemini-live' ? 'browser-webspeech' : 'gemini-live')}
              className="px-2.5 py-1 rounded-full bg-black/60 border border-cyber-primary/30 text-cyber-primary hover:border-cyber-primary transition-colors flex items-center gap-1 cursor-pointer"
              title="Click to toggle speech engine"
            >
              <Cpu className="w-3 h-3" />
              <span>{activeEngine === 'gemini-live' ? '⚡ Gemini Live API' : '🌐 Browser Web Speech'}</span>
              <span className="text-[9px] text-cyber-muted">(Switch)</span>
            </button>

            <button
              onClick={() => setGeminiModalOpen(true)}
              className={`px-2.5 py-1 rounded-full border text-[11px] font-mono flex items-center gap-1 transition-colors ${
                getStoredGeminiKey()
                  ? 'bg-cyan-950/60 border-cyber-accent text-cyber-accent hover:bg-cyan-900'
                  : 'bg-black/60 border-cyber-primary/30 text-cyber-muted hover:text-cyber-primary'
              }`}
              title="Configure Google Gemini API Key for AI features"
            >
              <Key className="w-3 h-3 text-cyber-accent" />
              <span>{getStoredGeminiKey() ? '✓ Gemini Key' : '+ Gemini Key'}</span>
            </button>
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
          <div className="absolute inset-0 cyber-grid opacity-30 pointer-events-none" />
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

        {/* Seek / Progress Bar with Running Timers */}
        <div className="w-full max-w-md mb-8">
          <div className="relative w-full h-1 bg-cyan-950 rounded-full overflow-hidden flex items-center">
            <div
              className="h-full bg-cyber-primary transition-all duration-200"
              style={{ width: `${Math.min(100, (duration / 90) * 100)}%` }}
            />
            <div
              className="absolute w-2.5 h-2.5 rounded-full bg-cyber-accent shadow-cyan-glow top-1/2 -translate-y-1/2"
              style={{ left: `calc(${Math.min(98, (duration / 90) * 100)}% - 4px)` }}
            />
          </div>
          <div className="flex justify-between items-center text-xs font-mono text-cyber-muted mt-2">
            <span className="text-cyber-primary">
              {Math.floor(duration / 60).toString().padStart(2, '0')}:{(duration % 60).toString().padStart(2, '0')}
            </span>
            <span>{recordingState === 'recording' ? '● LIVE RECORDING' : 'MAX 01:30'}</span>
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

          <span className="text-xs font-mono uppercase tracking-widest text-cyber-text font-bold">
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
              className="px-3 py-1 rounded-xl bg-black/40 border border-cyber-primary/30 text-cyber-muted hover:text-cyber-primary text-xs flex items-center gap-1 font-mono"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          )}
          {recordingState === 'paused' && (
            <button
              onClick={resumeMic}
              className="px-3 py-1 rounded-xl bg-cyber-primary/20 border border-cyber-primary text-cyber-primary text-xs flex items-center gap-1 animate-pulse font-mono"
            >
              <Play className="w-3.5 h-3.5 fill-cyber-primary" />
              <span>Resume</span>
            </button>
          )}
        </div>

        {micError && (
          <p className="mt-4 text-xs font-mono text-red-400 bg-red-950/40 p-2 rounded-xl border border-red-500/30">
            {micError}
          </p>
        )}
      </div>

      {/* Live Transcript Display Box with Action Buttons Bar */}
      <div className="w-full max-w-xl bg-cyber-card/85 border border-cyber-primary/25 rounded-28 p-5 backdrop-blur-md shadow-sm space-y-4">
        {/* Box Header */}
        <div className="flex items-center justify-between pb-2 border-b border-cyber-primary/15">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                recordingState === 'recording' || isWebSpeechListening
                  ? 'bg-red-500 animate-ping'
                  : 'bg-gray-500'
              }`}
            />
            <span
              className={
                recordingState === 'recording' || isWebSpeechListening
                  ? 'text-cyber-primary font-bold animate-pulse'
                  : 'text-cyber-muted'
              }
            >
              {recordingState === 'recording' || isWebSpeechListening
                ? isWebSpeechSpeaking
                  ? '🎙️ Speaking detected... transcribing live!'
                  : `🎙️ Microphone listening in ${currentLangObj.native} (${currentLangObj.label})... Speak now!`
                : 'Live Transcript Stream'}
            </span>
          </div>

          {/* Direct Top Controls: Listen (TTS) & Word Count */}
          <div className="flex items-center gap-2">
            {liveTranscript && (
              <>
                <TextToSpeechPlayer text={liveTranscript} language={selectedLanguage} />
                <span className="text-[10px] font-mono text-cyber-muted">
                  {liveTranscript.trim().split(/\s+/).filter(Boolean).length} words
                </span>
              </>
            )}
          </div>
        </div>

        {/* Live speech feedback banner when recording */}
        {(recordingState === 'recording' || isWebSpeechListening) && !liveTranscript && (
          <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyber-primary/40 flex items-center gap-2.5 text-xs text-cyber-primary font-mono animate-pulse">
            <Sparkles className="w-4 h-4 text-cyber-accent shrink-0 animate-spin" />
            <span>
              மைக் ஆன் செய்யப்பட்டுள்ளது! <strong className="text-white">{currentLangObj.native}</strong> மொழியில் பேச ஆரம்பியுங்கள் — உங்கள் வார்த்தைகள் கீழே உடனே தோன்றும்!
            </span>
          </div>
        )}

        {/* Web Speech Error Notice if any */}
        {webSpeechError && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs font-mono text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{webSpeechError}</span>
          </div>
        )}

        {/* Editable Transcript Area */}
        <textarea
          value={liveTranscript}
          onChange={(e) => {
            setIsEditingTranscript(true);
            setLiveTranscript(e.target.value);
          }}
          placeholder="மைக் ஆன் ஆனதும் பேச ஆரம்பியுங்கள்... நீங்கள் பேசும் தமிழ் (தமிழ் எழுத்துகளில்), English அல்லது Hindi வார்த்தைகள் இங்கே உடனுக்குடன் லைவ் டெக்ஸ்டாக வரும்!&#10;&#10;(Start speaking... Words in Tamil, English, or Hindi will appear here live in real-time!)"
          rows={7}
          className="w-full bg-black/40 border border-cyber-primary/20 rounded-2xl p-4 font-mono text-xs md:text-sm text-cyber-text leading-relaxed placeholder:text-cyber-muted/50 focus:outline-none focus:border-cyber-primary resize-y"
        />
        <div ref={transcriptEndRef} />

        {/* PROMINENT ACTION BUTTONS: Copy, Share, Save Recording, Download Audio, Export */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-cyber-primary/15">
          <div className="flex flex-wrap items-center gap-2">
            {/* Copy Button */}
            <button
              onClick={handleCopy}
              disabled={!liveTranscript.trim()}
              className="px-3 py-1.5 rounded-xl bg-black/50 border border-cyber-primary/30 hover:bg-cyber-primary/20 text-cyber-primary text-xs font-mono flex items-center gap-1.5 transition-colors disabled:opacity-40"
              title="Copy text to clipboard"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>

            {/* Share Button */}
            <button
              onClick={() => {
                if (savedTranscription) {
                  setShowShareModal(true);
                } else if (liveTranscript.trim()) {
                  // Save first then open share modal
                  performSave().then(() => setShowShareModal(true));
                } else {
                  showToast('Record or type some text first to share!');
                }
              }}
              disabled={!liveTranscript.trim()}
              className="px-3 py-1.5 rounded-xl bg-black/50 border border-cyber-primary/30 hover:bg-cyber-primary/20 text-cyber-accent text-xs font-mono flex items-center gap-1.5 transition-colors disabled:opacity-40"
              title="Share recording & link"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            {/* PDF Export Button */}
            <button
              onClick={handleExportPdf}
              disabled={!liveTranscript.trim()}
              className="px-3 py-1.5 rounded-xl bg-black/50 border border-cyber-accent/40 hover:bg-cyber-accent/20 text-cyber-accent text-xs font-mono flex items-center gap-1.5 transition-colors disabled:opacity-40"
              title="Download formatted PDF transcript"
            >
              <FileDown className="w-3.5 h-3.5 text-cyber-accent" />
              <span>PDF</span>
            </button>

            {/* Download Text */}
            <button
              onClick={handleDownloadText}
              disabled={!liveTranscript.trim()}
              className="px-3 py-1.5 rounded-xl bg-black/50 border border-cyber-primary/30 hover:bg-cyber-primary/20 text-cyber-muted hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors disabled:opacity-40"
              title="Download text file (.txt)"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>TXT</span>
            </button>

            {/* Convert Audio to Text Button (when audio is recorded or uploaded) */}
            {recordedAudioBlob && (
              <button
                onClick={handleConvertAudioToText}
                disabled={isTranscribingAudio}
                className="px-3 py-1.5 rounded-xl bg-cyan-950/70 border border-cyber-accent text-cyber-accent text-xs font-mono flex items-center gap-1.5 hover:bg-cyan-900 transition-colors"
                title="Convert recorded or uploaded audio directly to text with Gemini AI"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isTranscribingAudio ? 'animate-spin' : ''}`} />
                <span>{isTranscribingAudio ? 'Converting...' : 'Audio → Text'}</span>
              </button>
            )}

            {/* Upload Audio File to Convert */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAudioFileUpload}
              accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.aac"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isTranscribingAudio}
              className="px-3 py-1.5 rounded-xl bg-black/50 border border-cyber-accent/40 hover:bg-cyber-accent/20 text-cyber-accent text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Upload an audio file (.mp3, .wav, .m4a) to convert to text"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Audio</span>
            </button>

            {/* Download Audio (when recorded) */}
            {recordedAudioBlob && (
              <button
                onClick={handleDownloadLocalAudio}
                className="px-3 py-1.5 rounded-xl bg-black/50 border border-cyber-primary/30 hover:bg-cyber-primary/20 text-cyber-primary text-xs font-mono flex items-center gap-1.5 transition-colors"
                title="Download recorded audio file"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Audio</span>
              </button>
            )}
          </div>

          {/* MAIN PROMINENT SAVE RECORDING BUTTON */}
          <button
            onClick={() => performSave()}
            disabled={isSaving || !liveTranscript.trim()}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyber-primary to-cyan-500 text-black font-bold text-xs font-mono flex items-center gap-1.5 hover:shadow-cyan-glow-sm transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : savedTranscription ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Saved ✓</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Recording</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Post-Recording Audio Player Preview & History Navigation */}
      {(recordedAudioUrl || savedTranscription?.audio_url) && (
        <div className="w-full max-w-xl space-y-3 animate-fade-in">
          <div className="flex items-center justify-between text-xs font-mono text-cyber-accent">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-4 h-4" />
              <span>Recording Audio Playback</span>
            </span>
            {savedTranscription && (
              <button
                onClick={onNavigateToHistory}
                className="text-cyber-primary hover:underline flex items-center gap-1"
              >
                <span>View in History</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <AudioPlayer
            src={savedTranscription?.audio_url || recordedAudioUrl!}
            title={savedTranscription?.title || sessionTitle || 'Recording'}
          />
        </div>
      )}

      {/* AI Assistant Panel */}
      {savedTranscription && (
        <div className="w-full max-w-xl animate-fade-in">
          <AiAssistantPanel
            transcription={savedTranscription}
            onUpdate={(updated) => setSavedTranscription(updated)}
          />
        </div>
      )}

      {/* FULL LANGUAGE CHOOSER MODAL (Searches all 20+ languages) */}
      {langModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-cyber-bg/95 border border-cyber-primary/40 rounded-28 p-6 shadow-cyan-glow-lg text-cyber-text">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-cyber-primary/20">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-cyber-primary" />
                <h3 className="text-base font-bold tracking-wide uppercase text-cyber-primary">
                  Choose Language / Dialect
                </h3>
              </div>
              <button
                onClick={() => setLangModalOpen(false)}
                className="p-1 rounded-lg text-cyber-muted hover:text-cyber-primary hover:bg-cyber-primary/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mt-4 mb-4">
              <Search className="w-4 h-4 text-cyber-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search languages by name or code (e.g. Tamil, தமிழ், ta-IN)..."
                value={langSearch}
                onChange={(e) => setLangSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-black/50 border border-cyber-primary/30 rounded-xl text-xs text-cyber-text font-mono focus:outline-none focus:border-cyber-primary"
                autoFocus
              />
            </div>

            {/* Language Grid */}
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {filteredLanguages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setSelectedLanguage(l.code);
                    setLangModalOpen(false);
                    showToast(`Language set to ${l.label} (${l.native})`);
                  }}
                  className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-xs font-mono transition-all ${
                    selectedLanguage === l.code
                      ? 'bg-cyber-primary/20 border-cyber-primary text-cyber-primary font-bold shadow-cyan-glow-sm'
                      : 'bg-black/30 border-cyber-primary/15 text-cyber-text/80 hover:bg-cyber-primary/10 hover:border-cyber-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{l.label}</span>
                    <span className="text-[11px] text-cyber-primary">({l.native})</span>
                  </div>
                  <span className="text-[10px] text-cyber-muted bg-black/50 px-2 py-0.5 rounded border border-cyber-primary/20">
                    {l.code}
                  </span>
                </button>
              ))}

              {filteredLanguages.length === 0 && (
                <p className="text-center py-6 text-xs text-cyber-muted font-mono">
                  No language matched "{langSearch}".
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && savedTranscription && (
        <ShareModal
          transcription={savedTranscription}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          onUpdate={(updated) => setSavedTranscription(updated)}
        />
      )}
      {/* Google Gemini API Key Modal */}
      {geminiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-cyber-card border border-cyber-accent/40 rounded-28 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cyber-accent/20 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyber-accent" />
                <h3 className="text-base font-bold text-cyber-text">Google Gemini AI Key</h3>
              </div>
              <button
                onClick={() => setGeminiModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-cyber-muted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-cyber-muted leading-relaxed">
              Enter your Google Gemini API Key to enable instant AI audio file conversion (Tamil, English, Hindi), live WebSocket streaming, and AI Summaries.
            </p>

            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-xl bg-cyan-950/40 border border-cyber-accent/30 text-cyber-accent text-xs hover:bg-cyan-950/70 transition-colors"
            >
              <span className="font-semibold">Get a Free Gemini API Key (Google AI Studio)</span>
              <ExternalLink className="w-4 h-4 shrink-0" />
            </a>

            <div className="space-y-1">
              <label className="text-xs text-cyber-muted font-mono">Paste API Key</label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                className="w-full bg-black/60 border border-cyber-primary/40 rounded-xl px-3 py-2 text-xs text-cyber-primary font-mono focus:outline-none focus:border-cyber-accent"
                autoFocus
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setStoredGeminiKey(geminiKeyInput);
                  setGeminiModalOpen(false);
                  showToast('✓ Gemini API Key saved successfully!');
                  if (recordedAudioBlob) {
                    handleConvertAudioToText();
                  }
                }}
                disabled={!geminiKeyInput.trim()}
                className="flex-1 py-2.5 px-4 rounded-xl bg-cyber-primary text-black font-bold text-xs tracking-wide uppercase hover:bg-cyan-300 transition-colors disabled:opacity-40"
              >
                Save & Convert
              </button>
              <button
                onClick={() => setGeminiModalOpen(false)}
                className="py-2.5 px-4 rounded-xl bg-black/40 border border-gray-700 text-gray-300 text-xs hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
