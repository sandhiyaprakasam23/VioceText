import React, { useState, useEffect } from 'react';
import { Mic, Clock, Settings as SettingsIcon, Radio, Sparkles, FileText, Languages, Share2 } from 'lucide-react';
import { UserSettings } from './types';
import { fetchSettings, getOrCreateSessionId } from './services/api';
import { RecordPage } from './pages/RecordPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { PublicSharePage } from './pages/PublicSharePage';

export function App() {
  const [activeTab, setActiveTab] = useState<'record' | 'history' | 'settings'>('record');
  const [publicShareToken, setPublicShareToken] = useState<string | null>(null);

  const [settings, setSettings] = useState<UserSettings>({
    device_session_id: getOrCreateSessionId(),
    default_language: 'en-IN',
    default_engine: 'gemini-live',
    auto_save: true,
    save_audio: true,
    auto_copy_on_stop: false,
    show_timestamps: true,
    theme: 'dark',
    font_size: 'medium',
  });

  // Check URL pathname for /s/<token>
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/s\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      setPublicShareToken(match[1]);
    }

    // Load persisted settings
    fetchSettings()
      .then((data) => {
        if (data && data.device_session_id) {
          setSettings(data);
        }
      })
      .catch((err) => console.log('Using default local settings:', err));
  }, []);

  if (publicShareToken) {
    return (
      <div className="min-h-screen bg-cyber-bg cyber-grid text-cyber-text flex flex-col justify-between">
        <main className="container mx-auto px-4 py-8 flex-1">
          <PublicSharePage
            token={publicShareToken}
            onBackToApp={() => {
              window.history.pushState({}, '', '/');
              setPublicShareToken(null);
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyber-bg cyber-grid text-cyber-text flex flex-col justify-between selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navbar */}
      <header className="w-full border-b border-cyber-primary/20 bg-cyber-card/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <div
            onClick={() => setActiveTab('record')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-cyber-primary to-cyan-700 p-0.5 shadow-cyan-glow-sm group-hover:shadow-cyan-glow transition-all flex items-center justify-center">
              <div className="w-full h-full bg-cyber-bg rounded-[14px] flex items-center justify-center">
                <Radio className="w-4 h-4 text-cyber-primary animate-pulse" />
              </div>
            </div>
            <div>
              <span className="font-extrabold tracking-wider text-sm md:text-base text-cyber-text">
                VOICE<span className="text-cyber-primary">TEXT</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyber-primary/40 text-cyber-accent">
                AI Live Multilingual
              </span>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-black/40 border border-cyber-primary/25 rounded-24 p-1">
            <button
              onClick={() => setActiveTab('record')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-20 text-xs font-mono transition-all ${
                activeTab === 'record'
                  ? 'bg-cyber-primary text-black font-bold shadow-cyan-glow-sm'
                  : 'text-cyber-muted hover:text-cyber-primary'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Record</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-20 text-xs font-mono transition-all ${
                activeTab === 'history'
                  ? 'bg-cyber-primary text-black font-bold shadow-cyan-glow-sm'
                  : 'text-cyber-muted hover:text-cyber-primary'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>History</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-20 text-xs font-mono transition-all ${
                activeTab === 'settings'
                  ? 'bg-cyber-primary text-black font-bold shadow-cyan-glow-sm'
                  : 'text-cyber-muted hover:text-cyber-primary'
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </nav>

          {/* Session ID Chip */}
          <div className="flex items-center gap-2 text-[11px] font-mono text-cyber-muted">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="hidden sm:inline">Session:</span>
            <span className="text-cyber-accent">{settings.device_session_id?.slice(0, 10)}</span>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="max-w-6xl w-full mx-auto px-4 py-6 md:py-10 flex-1 flex flex-col items-center">
        {activeTab === 'record' && (
          <div className="w-full relative flex justify-center">
            {/* Desktop Left Side Floating Panel */}
            <aside className="hidden xl:flex flex-col gap-4 absolute left-0 top-6 w-64">
              <div className="bg-cyber-card/75 border border-cyber-primary/20 rounded-28 p-4 backdrop-blur-md space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-cyber-accent uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-cyber-primary" />
                  <span>Multilingual Engine</span>
                </div>
                <p className="text-[11px] text-cyber-muted leading-relaxed font-mono">
                  Speak code-mixed Tamil + English, Hindi + English, etc. Words are transcribed live in their native scripts.
                </p>
              </div>

              <div className="bg-cyber-card/75 border border-cyber-primary/20 rounded-28 p-4 backdrop-blur-md space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-cyber-accent uppercase tracking-wider">
                  <FileText className="w-4 h-4 text-cyber-primary" />
                  <span>Recent Transcripts</span>
                </div>
                <button
                  onClick={() => setActiveTab('history')}
                  className="w-full py-2 rounded-xl bg-cyber-primary/10 border border-cyber-primary/30 text-cyber-primary text-xs font-mono hover:bg-cyber-primary/20 transition-colors"
                >
                  View History Dashboard →
                </button>
              </div>
            </aside>

            {/* Center Record Page */}
            <div className="w-full flex justify-center">
              <RecordPage
                settings={settings}
                onNavigateToHistory={() => setActiveTab('history')}
                onNavigateToSettings={() => setActiveTab('settings')}
              />
            </div>

            {/* Desktop Right Side Floating Panel */}
            <aside className="hidden xl:flex flex-col gap-4 absolute right-0 top-6 w-64">
              <div className="bg-cyber-card/75 border border-cyber-primary/20 rounded-28 p-4 backdrop-blur-md space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-cyber-accent uppercase tracking-wider">
                  <Languages className="w-4 h-4 text-cyber-primary" />
                  <span>Audio & Storage</span>
                </div>
                <p className="text-[11px] text-cyber-muted leading-relaxed font-mono">
                  Captures 16kHz PCM chunks live over WebSocket with simultaneous MediaRecorder audio backup.
                </p>
                <div className="pt-2 border-t border-cyber-primary/15 text-[11px] font-mono text-cyber-primary space-y-1">
                  <p>✓ Audio Scrubbing</p>
                  <p>✓ PDF / TXT / JSON / SRT</p>
                  <p>✓ Shareable link /s/&lt;token&gt;</p>
                </div>
              </div>
            </aside>
          </div>
        )}

        {activeTab === 'history' && <HistoryPage />}

        {activeTab === 'settings' && (
          <SettingsPage
            currentSettings={settings}
            onSettingsChange={(newSettings) => setSettings(newSettings)}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-cyber-bg/95 border-t border-cyber-primary/30 backdrop-blur-lg px-6 py-2">
        <div className="flex items-center justify-around">
          <button
            onClick={() => setActiveTab('record')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all ${
              activeTab === 'record' ? 'text-cyber-primary' : 'text-cyber-muted'
            }`}
          >
            <Mic className="w-5 h-5" />
            <span className="text-[10px] font-mono">Record</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all ${
              activeTab === 'history' ? 'text-cyber-primary' : 'text-cyber-muted'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-[10px] font-mono">History</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all ${
              activeTab === 'settings' ? 'text-cyber-primary' : 'text-cyber-muted'
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="text-[10px] font-mono">Settings</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
