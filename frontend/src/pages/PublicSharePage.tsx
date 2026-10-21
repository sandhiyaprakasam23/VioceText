import React, { useState, useEffect } from 'react';
import { Radio, Clock, Globe, Copy, Check, ArrowLeft, Volume2, Sparkles } from 'lucide-react';
import { Transcription } from '../types';
import { fetchPublicTranscription } from '../services/api';
import { AudioPlayer } from '../components/AudioPlayer';
import { TextToSpeechPlayer } from '../components/TextToSpeechPlayer';

interface PublicSharePageProps {
  token: string;
  onBackToApp?: () => void;
}

export const PublicSharePage: React.FC<PublicSharePageProps> = ({ token, onBackToApp }) => {
  const [transcription, setTranscription] = useState<Transcription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await fetchPublicTranscription(token);
        setTranscription(data);
      } catch (err: any) {
        setError(err?.message || 'Shared session not found or link has expired.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const handleCopy = () => {
    if (!transcription) return;
    navigator.clipboard.writeText(transcription.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6">
        {onBackToApp && (
          <button
            onClick={onBackToApp}
            className="flex items-center gap-1.5 text-xs text-cyber-muted hover:text-cyber-primary transition-colors font-mono"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>VoiceText App</span>
          </button>
        )}
        <div className="flex items-center gap-2 text-xs font-mono text-cyber-primary ml-auto">
          <span className="w-2 h-2 rounded-full bg-cyber-primary animate-ping" />
          <span>Shared Recording</span>
        </div>
      </div>

      {loading ? (
        <div className="h-64 bg-cyber-card/40 border border-cyber-primary/20 rounded-28 animate-pulse flex items-center justify-center text-cyber-muted">
          Loading shared session...
        </div>
      ) : error ? (
        <div className="bg-red-950/30 border border-red-500/40 rounded-28 p-8 text-center text-red-200">
          <p className="font-semibold text-base mb-1">Session Unavailable</p>
          <p className="text-xs text-red-300 font-mono">{error}</p>
        </div>
      ) : transcription ? (
        <div className="bg-cyber-card/90 border border-cyber-primary/30 rounded-28 p-6 md:p-8 backdrop-blur-md shadow-cyan-glow-lg corner-bracket space-y-5">
          {/* Title & Metadata */}
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-cyber-text tracking-wide mb-2">
              {transcription.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-cyber-muted">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-cyber-primary" />
                <span>{new Date(transcription.created_at).toLocaleDateString()}</span>
              </span>
              <span>•</span>
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-950/80 border border-cyber-primary/30 text-cyber-primary">
                {transcription.language}
              </span>
              <span>•</span>
              <span>{transcription.duration_seconds}s</span>
              <span>•</span>
              <span>{transcription.word_count} words</span>
            </div>
          </div>

          {/* Audio Player if recorded */}
          {transcription.audio_url && (
            <div>
              <AudioPlayer src={transcription.audio_url} title={transcription.title} />
            </div>
          )}

          {/* Transcript Box */}
          <div className="bg-black/40 border border-cyber-primary/20 rounded-2xl p-4 font-mono text-sm leading-relaxed text-cyber-text/95 whitespace-pre-wrap max-h-96 overflow-y-auto">
            {transcription.text}
          </div>

          {/* AI Summary if present */}
          {transcription.summary && (
            <div className="bg-cyan-950/30 border border-cyber-primary/20 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-cyber-accent font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Summary</span>
              </div>
              <p className="text-cyber-text/90 font-mono leading-relaxed">{transcription.summary}</p>
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2 border-t border-cyber-primary/15">
            <TextToSpeechPlayer text={transcription.text} language={transcription.language} />
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-xl bg-cyber-primary/20 hover:bg-cyber-primary/30 border border-cyber-primary text-cyber-primary flex items-center gap-1.5 text-xs font-mono transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Transcript'}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
