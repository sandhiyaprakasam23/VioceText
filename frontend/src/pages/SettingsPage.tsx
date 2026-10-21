import React, { useState, useEffect } from 'react';
import {
  Settings,
  Languages,
  Cpu,
  Save,
  Volume2,
  Copy,
  Clock,
  Sun,
  Moon,
  Trash2,
  Download,
  Check,
  Shield,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { UserSettings, SUPPORTED_LANGUAGES, EngineType } from '../types';
import {
  fetchSettings,
  updateSettings,
  fetchTranscriptions,
  bulkDeleteTranscriptions,
  getStoredGeminiKey,
  setStoredGeminiKey,
} from '../services/api';

interface SettingsPageProps {
  currentSettings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentSettings,
  onSettingsChange,
}) => {
  const [settings, setSettings] = useState<UserSettings>(currentSettings);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [geminiKey, setGeminiKey] = useState(getStoredGeminiKey());

  useEffect(() => {
    setSettings(currentSettings);
  }, [currentSettings]);

  const handleChange = async (field: keyof UserSettings, value: any) => {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    onSettingsChange(updated);

    try {
      setSaving(true);
      await updateSettings({ [field]: value });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 1500);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleExportAll = async () => {
    try {
      const data = await fetchTranscriptions({ page: 1 });
      const blob = new Blob([JSON.stringify(data.results, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voicetext_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export data');
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('WARNING: Are you sure you want to permanently clear ALL transcriptions for this device? This cannot be undone.')) {
      return;
    }
    try {
      const list = await fetchTranscriptions();
      const ids = list.results.map((x) => x.id);
      if (ids.length > 0) {
        await bulkDeleteTranscriptions(ids);
      }
      alert('All transcriptions cleared.');
      window.location.reload();
    } catch (err) {
      alert('Failed to clear history');
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 pb-20">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-cyber-primary" />
          <h2 className="text-lg font-bold tracking-wide uppercase text-cyber-text">Preferences & Settings</h2>
        </div>
        {savedSuccess && (
          <span className="flex items-center gap-1 text-xs text-cyber-primary font-mono bg-cyan-950/40 px-2 py-1 rounded-lg border border-cyber-primary/30">
            <Check className="w-3.5 h-3.5" />
            <span>Saved</span>
          </span>
        )}
      </div>

      {/* Main Settings Card */}
      <div className="bg-cyber-card/85 border border-cyber-primary/30 rounded-28 p-6 backdrop-blur-md space-y-6 shadow-sm corner-bracket">
        {/* Default Language */}
        <div className="flex items-center justify-between pb-4 border-b border-cyber-primary/15">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium text-cyber-text">
              <Languages className="w-4 h-4 text-cyber-primary" />
              <span>Default Spoken Language</span>
            </div>
            <p className="text-xs text-cyber-muted">Primary or multilingual target for speech recognition</p>
          </div>
          <select
            value={settings.default_language}
            onChange={(e) => handleChange('default_language', e.target.value)}
            className="bg-black/50 border border-cyber-primary/30 rounded-xl px-3 py-1.5 text-xs text-cyber-primary font-mono focus:outline-none focus:border-cyber-primary"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.native} ({lang.code})
              </option>
            ))}
          </select>
        </div>

        {/* Engine Switch */}
        <div className="flex items-center justify-between pb-4 border-b border-cyber-primary/15">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium text-cyber-text">
              <Cpu className="w-4 h-4 text-cyber-accent" />
              <span>Speech Recognition Engine</span>
            </div>
            <p className="text-xs text-cyber-muted">
              Browser Web Speech API (Free / Instant) or Gemini Live API (Google Cloud AI)
            </p>
          </div>
          <select
            value={settings.default_engine}
            onChange={(e) => handleChange('default_engine', e.target.value as EngineType)}
            className="bg-black/50 border border-cyber-primary/30 rounded-xl px-3 py-1.5 text-xs text-cyber-accent font-mono focus:outline-none focus:border-cyber-primary"
          >
            <option value="browser-webspeech">Browser Web Speech API (Free / Default)</option>
            <option value="gemini-live">Gemini Live API (Google Cloud AI)</option>
          </select>
        </div>

        {/* Gemini API Key */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-cyber-primary/15">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium text-cyber-text">
              <Sparkles className="w-4 h-4 text-cyber-accent" />
              <span>Google Gemini API Key (Optional)</span>
            </div>
            <p className="text-xs text-cyber-muted">
              Enables Gemini multimodal audio file transcription, live streaming, & AI summaries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="password"
              placeholder="AIzaSy... (optional)"
              value={geminiKey}
              onChange={(e) => {
                const val = e.target.value;
                setGeminiKey(val);
                setStoredGeminiKey(val);
                setSavedSuccess(true);
                setTimeout(() => setSavedSuccess(false), 1500);
              }}
              className="bg-black/50 border border-cyber-primary/30 rounded-xl px-3 py-1.5 text-xs text-cyber-primary font-mono focus:outline-none focus:border-cyber-accent w-48"
            />
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-cyber-accent underline shrink-0 hover:text-white"
              title="Get free key from Google AI Studio"
            >
              Get Free Key
            </a>
          </div>
        </div>

        {/* Auto-Save Toggle */}
        <div className="flex items-center justify-between pb-4 border-b border-cyber-primary/15">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium text-cyber-text">
              <Save className="w-4 h-4 text-cyber-primary" />
              <span>Auto-Save Sessions</span>
            </div>
            <p className="text-xs text-cyber-muted">Automatically save transcriptions to database when recording stops</p>
          </div>
          <button
            onClick={() => handleChange('auto_save', !settings.auto_save)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
              settings.auto_save ? 'bg-cyber-primary justify-end' : 'bg-gray-700 justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-black shadow-md" />
          </button>
        </div>

        {/* Save Audio Recording Toggle */}
        <div className="flex items-center justify-between pb-4 border-b border-cyber-primary/15">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium text-cyber-text">
              <Volume2 className="w-4 h-4 text-cyber-accent" />
              <span>Record & Store Audio File</span>
            </div>
            <p className="text-xs text-cyber-muted">Capture full audio recording via MediaRecorder for playback and download</p>
          </div>
          <button
            onClick={() => handleChange('save_audio', !settings.save_audio)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
              settings.save_audio ? 'bg-cyber-primary justify-end' : 'bg-gray-700 justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-black shadow-md" />
          </button>
        </div>

        {/* Auto-Copy to Clipboard */}
        <div className="flex items-center justify-between pb-4 border-b border-cyber-primary/15">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium text-cyber-text">
              <Copy className="w-4 h-4 text-cyber-primary" />
              <span>Auto-Copy on Stop</span>
            </div>
            <p className="text-xs text-cyber-muted">Automatically copy transcribed text to clipboard when stopping</p>
          </div>
          <button
            onClick={() => handleChange('auto_copy_on_stop', !settings.auto_copy_on_stop)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
              settings.auto_copy_on_stop ? 'bg-cyber-primary justify-end' : 'bg-gray-700 justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-black shadow-md" />
          </button>
        </div>

        {/* Device Privacy Notice */}
        <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyber-primary/20 flex items-start gap-3">
          <Shield className="w-5 h-5 text-cyber-accent shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-cyber-text">Anonymous Device Isolation Active</p>
            <p className="text-cyber-muted font-mono">
              Session UUID: {settings.device_session_id?.slice(0, 18)}...
            </p>
            <p className="text-cyber-muted">
              Your transcriptions are strictly private to this browser session and never mixed with other visitors.
            </p>
          </div>
        </div>

        {/* Data Actions */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExportAll}
            className="flex-1 py-2.5 px-4 rounded-xl bg-black/40 border border-cyber-primary/40 text-cyber-primary hover:bg-cyber-primary/10 transition-colors text-xs font-mono flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Export All Data (JSON)</span>
          </button>

          <button
            onClick={handleClearHistory}
            className="py-2.5 px-4 rounded-xl bg-red-950/20 border border-red-500/30 text-red-400 hover:bg-red-950/40 transition-colors text-xs font-mono flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear History</span>
          </button>
        </div>
      </div>
    </div>
  );
};
