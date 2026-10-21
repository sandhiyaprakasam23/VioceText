import React, { useState } from 'react';
import { X, Copy, Check, Share2, Globe, MessageCircle, Send, Mail, Twitter } from 'lucide-react';
import { Transcription } from '../types';
import { toggleShare } from '../services/api';

interface ShareModalProps {
  transcription: Transcription;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updated: Transcription) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  transcription,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isPublic, setIsPublic] = useState(transcription.is_public);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen) return null;

  const publicUrl = `${window.location.origin}/s/${transcription.share_token}`;
  const shareText = `Transcript: "${transcription.title}"\n${transcription.text.slice(0, 150)}...\nListen & read full session: ${publicUrl}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleTogglePublic = async () => {
    try {
      setIsUpdating(true);
      const res = await toggleShare(transcription.id, !isPublic);
      setIsPublic(res.is_public);
      onUpdate({ ...transcription, is_public: res.is_public, share_token: res.share_token });
    } catch (err) {
      console.error('Failed to toggle public state:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: transcription.title,
          text: transcription.text.slice(0, 200),
          url: publicUrl,
        });
      } catch (err) {
        // Ignored if cancelled
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-cyber-bg/95 border border-cyber-primary/40 rounded-28 p-6 shadow-cyan-glow-lg text-cyber-text">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-cyber-primary/20">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-cyber-primary" />
            <h3 className="text-lg font-bold tracking-wide uppercase text-cyber-primary">Share Recording</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-cyber-muted hover:text-cyber-primary hover:bg-cyber-primary/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Public link toggle */}
        <div className="mt-5 p-4 bg-cyan-950/40 rounded-2xl border border-cyber-primary/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-cyber-accent" />
            <div>
              <p className="text-sm font-medium">Public Share Link</p>
              <p className="text-xs text-cyber-muted">Anyone with this link can listen & read</p>
            </div>
          </div>
          <button
            onClick={handleTogglePublic}
            disabled={isUpdating}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
              isPublic ? 'bg-cyber-primary justify-end' : 'bg-gray-700 justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-black shadow-md transform transition-transform" />
          </button>
        </div>

        {/* Link Box */}
        {isPublic && (
          <div className="mt-4">
            <label className="text-xs text-cyber-muted uppercase tracking-wider mb-1 block">Shareable URL</label>
            <div className="flex items-center gap-2 bg-black/50 border border-cyber-primary/30 rounded-xl p-2 font-mono text-xs">
              <input
                type="text"
                readOnly
                value={publicUrl}
                className="w-full bg-transparent text-cyber-primary outline-none truncate"
              />
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 rounded-lg bg-cyber-primary/20 hover:bg-cyber-primary/30 text-cyber-primary border border-cyber-primary/40 flex items-center gap-1 shrink-0 transition-colors"
              >
                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Social Share Grid */}
        <div className="mt-6">
          <p className="text-xs text-cyber-muted uppercase tracking-wider mb-3">Quick Share</p>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {/* WhatsApp */}
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              <span>WhatsApp</span>
            </a>

            {/* Telegram */}
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(publicUrl)}&text=${encodeURIComponent(transcription.title)}`}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-sky-950/30 border border-sky-500/30 text-sky-400 hover:bg-sky-900/40 transition-colors"
            >
              <Send className="w-5 h-5" />
              <span>Telegram</span>
            </a>

            {/* X / Twitter */}
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(transcription.title)}&url=${encodeURIComponent(publicUrl)}`}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-slate-900/40 border border-slate-600/30 text-slate-300 hover:bg-slate-800/50 transition-colors"
            >
              <Twitter className="w-5 h-5" />
              <span>X / Twitter</span>
            </a>

            {/* Email */}
            <a
              href={`mailto:?subject=${encodeURIComponent(transcription.title)}&body=${encodeURIComponent(shareText)}`}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-cyan-950/30 border border-cyber-primary/30 text-cyber-primary hover:bg-cyan-900/40 transition-colors"
            >
              <Mail className="w-5 h-5" />
              <span>Email</span>
            </a>
          </div>
        </div>

        {/* Native Web Share button */}
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button
            onClick={handleNativeShare}
            className="w-full mt-5 py-2.5 rounded-xl bg-gradient-to-r from-cyber-primary/20 to-cyber-accent/20 border border-cyber-primary text-cyber-primary hover:bg-cyber-primary/30 transition-all font-medium text-sm flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            <span>More Sharing Options</span>
          </button>
        )}
      </div>
    </div>
  );
};
