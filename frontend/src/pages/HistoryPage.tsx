import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Star,
  Trash2,
  Share2,
  Copy,
  Check,
  FileDown,
  Sparkles,
  Edit2,
  Clock,
  Globe,
  Radio,
  FileText,
  Volume2,
  CheckSquare,
  Square,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { Transcription, Stats, SUPPORTED_LANGUAGES } from '../types';
import {
  fetchTranscriptions,
  deleteTranscription,
  bulkDeleteTranscriptions,
  toggleFavorite,
  updateTranscription,
  fetchStats,
  getExportUrl,
} from '../services/api';
import { AudioPlayer } from '../components/AudioPlayer';
import { TextToSpeechPlayer } from '../components/TextToSpeechPlayer';
import { ShareModal } from '../components/ShareModal';
import { AiAssistantPanel } from '../components/AiAssistantPanel';

export const HistoryPage: React.FC = () => {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLang, setSelectedLang] = useState('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [shareItem, setShareItem] = useState<Transcription | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [expandedAiId, setExpandedAiId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [listRes, statsRes] = await Promise.all([
        fetchTranscriptions({
          search: search.trim() || undefined,
          language: selectedLang !== 'all' ? selectedLang : undefined,
          is_favorite: onlyFavorites ? true : undefined,
        }),
        fetchStats(),
      ]);
      setTranscriptions(listRes.results);
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedLang, onlyFavorites]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleFavorite = async (id: string) => {
    try {
      const nextState = await toggleFavorite(id);
      setTranscriptions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_favorite: nextState } : t))
      );
    } catch (err) {
      showToast('Failed to update favorite');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this transcription?')) return;
    try {
      await deleteTranscription(id);
      setTranscriptions((prev) => prev.filter((t) => t.id !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      showToast('Transcription deleted');
      // refresh stats
      fetchStats().then(setStats);
    } catch (err) {
      showToast('Failed to delete item');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected transcriptions?`)) return;
    try {
      await bulkDeleteTranscriptions(selectedIds);
      setTranscriptions((prev) => prev.filter((t) => !selectedIds.includes(t.id)));
      setSelectedIds([]);
      showToast('Selected transcriptions deleted');
      fetchStats().then(setStats);
    } catch (err) {
      showToast('Bulk delete failed');
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === transcriptions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transcriptions.map((t) => t.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  };

  const startEditTitle = (t: Transcription) => {
    setEditingId(t.id);
    setEditTitle(t.title);
  };

  const saveEditTitle = async (id: string) => {
    if (!editTitle.trim()) return;
    try {
      const updated = await updateTranscription(id, { title: editTitle.trim() });
      setTranscriptions((prev) => prev.map((t) => (t.id === id ? { ...t, title: updated.title } : t)));
      setEditingId(null);
      showToast('Title updated');
    } catch (err) {
      showToast('Failed to update title');
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-cyber-primary text-black font-semibold px-4 py-2 rounded-full shadow-cyan-glow flex items-center gap-2 text-xs animate-bounce">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Stats Strip */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-cyber-card/70 border border-cyber-primary/20 rounded-2xl p-4 backdrop-blur-md">
            <p className="text-xs text-cyber-muted uppercase tracking-wider">Total Sessions</p>
            <p className="text-2xl font-bold font-mono text-cyber-primary mt-1">{stats.total_sessions}</p>
          </div>
          <div className="bg-cyber-card/70 border border-cyber-primary/20 rounded-2xl p-4 backdrop-blur-md">
            <p className="text-xs text-cyber-muted uppercase tracking-wider">Total Minutes</p>
            <p className="text-2xl font-bold font-mono text-cyber-primary mt-1">{stats.total_minutes}m</p>
          </div>
          <div className="bg-cyber-card/70 border border-cyber-primary/20 rounded-2xl p-4 backdrop-blur-md">
            <p className="text-xs text-cyber-muted uppercase tracking-wider">Total Words</p>
            <p className="text-2xl font-bold font-mono text-cyber-accent mt-1">{stats.total_words}</p>
          </div>
          <div className="bg-cyber-card/70 border border-cyber-primary/20 rounded-2xl p-4 backdrop-blur-md">
            <p className="text-xs text-cyber-muted uppercase tracking-wider">Top Language</p>
            <p className="text-2xl font-bold font-mono text-cyber-accent mt-1 truncate">{stats.top_language}</p>
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-cyber-card/80 border border-cyber-primary/25 rounded-28 p-4 backdrop-blur-md space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative flex items-center">
            <Search className="w-4 h-4 text-cyber-muted absolute left-3.5" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search transcript text or title... (Press '/' to focus)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-cyber-primary/30 rounded-2xl text-xs text-cyber-text placeholder:text-cyber-muted focus:outline-none focus:border-cyber-primary focus:ring-1 focus:ring-cyber-primary/50 transition-all font-mono"
            />
          </div>

          {/* Language filter */}
          <div className="flex items-center gap-2">
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="bg-black/40 border border-cyber-primary/30 rounded-2xl px-3 py-2 text-xs text-cyber-primary focus:outline-none focus:border-cyber-primary font-mono cursor-pointer"
            >
              <option value="all">All Languages</option>
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native} ({l.code})
                </option>
              ))}
            </select>

            {/* Favorite filter */}
            <button
              onClick={() => setOnlyFavorites(!onlyFavorites)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs border transition-all ${
                onlyFavorites
                  ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300 font-semibold'
                  : 'bg-black/40 border-cyber-primary/30 text-cyber-muted hover:text-yellow-300'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-yellow-400' : ''}`} />
              <span>Favorites</span>
            </button>
          </div>
        </div>

        {/* Multi-select bar */}
        {transcriptions.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-cyber-primary/15 text-xs text-cyber-muted">
            <button
              onClick={handleToggleSelectAll}
              className="flex items-center gap-1.5 hover:text-cyber-primary transition-colors"
            >
              {selectedIds.length === transcriptions.length ? (
                <CheckSquare className="w-4 h-4 text-cyber-primary" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span>Select All ({selectedIds.length}/{transcriptions.length})</span>
            </button>

            {selectedIds.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 text-red-400 hover:text-red-300 transition-colors bg-red-950/30 px-3 py-1 rounded-xl border border-red-500/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedIds.length})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-44 bg-cyber-card/40 border border-cyber-primary/10 rounded-28 animate-pulse" />
          ))}
        </div>
      ) : transcriptions.length === 0 ? (
        <div className="bg-cyber-card/40 border border-cyber-primary/20 rounded-28 p-12 text-center backdrop-blur-md">
          <FileText className="w-12 h-12 text-cyber-muted/40 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-cyber-text">No transcriptions found</h3>
          <p className="text-xs text-cyber-muted mt-1 max-w-sm mx-auto">
            {search || selectedLang !== 'all' || onlyFavorites
              ? 'Try clearing your search query or filters to see all recorded sessions.'
              : 'Start speaking to record your first real-time code-mixed transcription!'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {transcriptions.map((t) => (
            <div
              key={t.id}
              className={`bg-cyber-card/85 border transition-all rounded-28 p-5 backdrop-blur-md shadow-sm relative corner-bracket ${
                selectedIds.includes(t.id) ? 'border-cyber-primary ring-1 ring-cyber-primary/40' : 'border-cyber-primary/25 hover:border-cyber-primary/50'
              }`}
            >
              {/* Header: Title, Checkbox, Star & Delete */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-cyber-primary/15">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => handleToggleSelectOne(t.id)}
                    className="mt-1 text-cyber-muted hover:text-cyber-primary transition-colors shrink-0"
                  >
                    {selectedIds.includes(t.id) ? (
                      <CheckSquare className="w-4 h-4 text-cyber-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    {editingId === t.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="bg-black/60 border border-cyber-primary px-2.5 py-1 rounded-xl text-sm font-semibold text-cyber-text focus:outline-none w-full"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && saveEditTitle(t.id)}
                        />
                        <button
                          onClick={() => saveEditTitle(t.id)}
                          className="p-1 rounded-lg bg-cyber-primary text-black hover:bg-cyber-accent"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-cyber-text tracking-wide truncate">{t.title}</h3>
                        <button
                          onClick={() => startEditTitle(t)}
                          className="text-cyber-muted hover:text-cyber-primary p-0.5"
                          title="Rename title"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Metadata tags */}
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] font-mono text-cyber-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-cyber-primary" />
                        <span>{formatDate(t.created_at)}</span>
                      </span>
                      <span>•</span>
                      <span className="px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyber-primary/30 text-cyber-primary">
                        {t.language}
                      </span>
                      <span>•</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                        {t.engine === 'gemini-live' ? '⚡ Gemini Live' : '🌐 Web Speech'}
                      </span>
                      <span>•</span>
                      <span>{formatDuration(t.duration_seconds)}</span>
                      <span>•</span>
                      <span>{t.word_count} words</span>
                    </div>
                  </div>
                </div>

                {/* Right Quick Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleFavorite(t.id)}
                    className={`p-1.5 rounded-xl border transition-colors ${
                      t.is_favorite
                        ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300'
                        : 'border-transparent text-cyber-muted hover:text-yellow-300'
                    }`}
                    title={t.is_favorite ? 'Remove favorite' : 'Add to favorites'}
                  >
                    <Star className={`w-4 h-4 ${t.is_favorite ? 'fill-yellow-400' : ''}`} />
                  </button>

                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 rounded-xl text-cyber-muted hover:text-red-400 transition-colors"
                    title="Delete recording"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Transcript Text Body */}
              <div className="my-3 font-mono text-xs text-cyber-text/90 leading-relaxed bg-black/30 p-3 rounded-2xl border border-cyber-primary/10 max-h-36 overflow-y-auto whitespace-pre-wrap">
                {t.text || <span className="italic text-cyber-muted">No text captured.</span>}
              </div>

              {/* Audio Player if available */}
              {t.audio_url && (
                <div className="mb-3">
                  <AudioPlayer src={t.audio_url} title={t.title} />
                </div>
              )}

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-cyber-primary/15">
                <div className="flex items-center gap-2">
                  {/* Listen (TTS) */}
                  <TextToSpeechPlayer text={t.text} language={t.language} />

                  {/* Copy */}
                  <button
                    onClick={() => handleCopyText(t.text)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs bg-black/40 border border-cyber-primary/20 text-cyber-primary hover:bg-cyber-primary/10 transition-colors"
                    title="Copy transcript"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </button>

                  {/* Share */}
                  <button
                    onClick={() => setShareItem(t)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs bg-black/40 border border-cyber-primary/20 text-cyber-primary hover:bg-cyber-primary/10 transition-colors"
                    title="Share recording & transcript"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>

                  {/* Export dropdown */}
                  <div className="relative group">
                    <button
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs bg-black/40 border border-cyber-primary/20 text-cyber-primary hover:bg-cyber-primary/10 transition-colors"
                      title="Download format"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Export</span>
                    </button>
                    <div className="hidden group-hover:flex flex-col absolute left-0 bottom-full mb-1 z-20 bg-cyber-bg border border-cyber-primary/40 rounded-xl p-1 shadow-lg font-mono text-[11px] min-w-[90px]">
                      {(['txt', 'pdf', 'json', 'srt'] as const).map((fmt) => (
                        <a
                          key={fmt}
                          href={getExportUrl(t.id, fmt)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded hover:bg-cyber-primary/20 text-cyber-primary uppercase text-left transition-colors"
                        >
                          .{fmt}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                {/* AI Assistant Expand Button */}
                <button
                  onClick={() => setExpandedAiId(expandedAiId === t.id ? null : t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs border transition-colors ${
                    expandedAiId === t.id || t.summary
                      ? 'bg-cyber-accent/20 border-cyber-accent text-cyber-accent font-semibold'
                      : 'bg-black/40 border-cyber-primary/20 text-cyber-muted hover:text-cyber-accent'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Assistant</span>
                </button>
              </div>

              {/* AI Assistant Drawer */}
              {expandedAiId === t.id && (
                <div className="mt-4 pt-3 border-t border-cyber-primary/20">
                  <AiAssistantPanel
                    transcription={t}
                    onUpdate={(updated) => {
                      setTranscriptions((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Share Modal */}
      {shareItem && (
        <ShareModal
          transcription={shareItem}
          isOpen={Boolean(shareItem)}
          onClose={() => setShareItem(null)}
          onUpdate={(updated) => {
            setTranscriptions((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
          }}
        />
      )}
    </div>
  );
};
