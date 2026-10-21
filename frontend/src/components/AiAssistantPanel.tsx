import React, { useState } from 'react';
import { Sparkles, CheckCircle2, ListChecks, Languages, RefreshCw, Copy, Check } from 'lucide-react';
import { Transcription } from '../types';
import { analyzeTranscription } from '../services/api';

interface AiAssistantPanelProps {
  transcription: Transcription;
  onUpdate?: (updated: Transcription) => void;
  className?: string;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  transcription,
  onUpdate,
  className = '',
}) => {
  const [loading, setLoading] = useState(false);
  const [activeLang, setActiveLang] = useState<'en' | 'ta' | 'hi'>('en');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const hasAnalysis = Boolean(transcription.summary || (transcription.key_points && transcription.key_points.length > 0));

  const handleRunAnalysis = async () => {
    try {
      setLoading(true);
      const updated = await analyzeTranscription(transcription.id, activeLang);
      if (onUpdate) onUpdate(updated);
    } catch (err) {
      console.error('Failed to run AI analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className={`bg-cyan-950/20 border border-cyber-primary/30 rounded-28 p-5 backdrop-blur-md ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-cyber-primary/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyber-accent animate-pulse" />
          <h4 className="text-sm font-semibold tracking-wide uppercase text-cyber-accent">AI Smart Assistant</h4>
        </div>
        <button
          onClick={handleRunAnalysis}
          disabled={loading || !transcription.text}
          className="px-2.5 py-1 text-xs rounded-xl bg-cyber-primary/20 hover:bg-cyber-primary/30 border border-cyber-primary/40 text-cyber-primary flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{hasAnalysis ? 'Re-Analyze' : 'Run Assistant'}</span>
        </button>
      </div>

      {loading ? (
        <div className="py-6 flex flex-col items-center justify-center gap-3 text-cyber-muted text-xs">
          <Sparkles className="w-6 h-6 text-cyber-primary animate-spin" />
          <p className="font-mono">Gemini AI synthesizing summary & key takeaways...</p>
        </div>
      ) : !hasAnalysis ? (
        <div className="py-5 text-center text-cyber-muted text-xs">
          <p>Click "Run Assistant" to generate a 2-line summary, key action items, and multilingual translation.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4 text-xs">
          {/* 2-line Summary */}
          {transcription.summary && (
            <div>
              <div className="flex items-center justify-between text-cyber-accent font-medium mb-1">
                <span>Summary</span>
                <button
                  onClick={() => copyToClipboard(transcription.summary || '', 'summary')}
                  className="hover:text-cyber-primary"
                  title="Copy summary"
                >
                  {copiedKey === 'summary' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <p className="text-cyber-text/90 leading-relaxed bg-black/30 p-2.5 rounded-xl border border-cyber-primary/15 font-mono text-[11px]">
                {transcription.summary}
              </p>
            </div>
          )}

          {/* Key Points */}
          {transcription.key_points && transcription.key_points.length > 0 && (
            <div>
              <p className="text-cyber-accent font-medium mb-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Key Points</span>
              </p>
              <ul className="space-y-1 bg-black/30 p-2.5 rounded-xl border border-cyber-primary/15">
                {transcription.key_points.map((pt, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-cyber-text/80">
                    <span className="text-cyber-primary font-bold">•</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Items */}
          {transcription.action_items && transcription.action_items.length > 0 && (
            <div>
              <p className="text-cyber-accent font-medium mb-1 flex items-center gap-1">
                <ListChecks className="w-3.5 h-3.5" />
                <span>Action Items</span>
              </p>
              <ul className="space-y-1 bg-black/30 p-2.5 rounded-xl border border-cyber-primary/15">
                {transcription.action_items.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-cyber-text/80">
                    <input type="checkbox" className="mt-0.5 rounded accent-cyber-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Multilingual Translation */}
          {transcription.translation && Object.keys(transcription.translation).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-cyber-accent font-medium flex items-center gap-1">
                  <Languages className="w-3.5 h-3.5" />
                  <span>Multilingual Translation</span>
                </span>
                {/* Language Switcher Tabs */}
                <div className="flex items-center gap-1 bg-black/50 p-0.5 rounded-lg border border-cyber-primary/20">
                  <button
                    onClick={() => setActiveLang('en')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      activeLang === 'en' ? 'bg-cyber-primary text-black font-bold' : 'text-cyber-muted hover:text-white'
                    }`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => setActiveLang('ta')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      activeLang === 'ta' ? 'bg-cyber-primary text-black font-bold' : 'text-cyber-muted hover:text-white'
                    }`}
                  >
                    தமிழ்
                  </button>
                  <button
                    onClick={() => setActiveLang('hi')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      activeLang === 'hi' ? 'bg-cyber-primary text-black font-bold' : 'text-cyber-muted hover:text-white'
                    }`}
                  >
                    हिन्दी
                  </button>
                </div>
              </div>
              <div className="bg-black/30 p-2.5 rounded-xl border border-cyber-primary/15 font-mono text-[11px] text-cyber-text/90 relative">
                <p>{transcription.translation[activeLang] || transcription.text}</p>
                <button
                  onClick={() => copyToClipboard(transcription.translation[activeLang] || transcription.text, 'translation')}
                  className="absolute top-2 right-2 p-1 text-cyber-muted hover:text-cyber-primary"
                  title="Copy translation"
                >
                  {copiedKey === 'translation' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
