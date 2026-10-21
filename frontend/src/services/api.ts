import { Transcription, UserSettings, Stats } from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'https://viocetext.onrender.com'
);

export const WS_BASE_URL = import.meta.env.VITE_WS_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'ws://localhost:8000/ws/transcribe/'
    : 'wss://viocetext.onrender.com/ws/transcribe/'
);

// Anonymous per-device session isolation UUID
export function getOrCreateSessionId(): string {
  const STORAGE_KEY = 'voicetext_device_session_id';
  let sessionId = localStorage.getItem(STORAGE_KEY);
  if (!sessionId) {
    sessionId = 'dev_' + crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, sessionId);
  }
  return sessionId;
}

export function getStoredGeminiKey(): string {
  return localStorage.getItem('voicetext_gemini_api_key') || '';
}

export function setStoredGeminiKey(key: string): void {
  const clean = key.trim();
  if (clean) {
    localStorage.setItem('voicetext_gemini_api_key', clean);
  } else {
    localStorage.removeItem('voicetext_gemini_api_key');
  }
}

const LOCAL_STORAGE_HISTORY_KEY = 'voicetext_local_history';

export function getLocalHistory(): Transcription[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToLocalHistory(item: Transcription): void {
  try {
    const history = getLocalHistory();
    const existingIndex = history.findIndex((h) => h.id === item.id);
    if (existingIndex >= 0) {
      history[existingIndex] = item;
    } else {
      history.unshift(item);
    }
    localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  } catch {}
}

function getHeaders(customHeaders: Record<string, string> = {}): HeadersInit {
  return {
    'X-Session-ID': getOrCreateSessionId(),
    ...customHeaders,
  };
}

export async function fetchTranscriptions(params: {
  search?: string;
  language?: string;
  is_favorite?: boolean;
  date_from?: string;
  date_to?: string;
  ordering?: string;
  page?: number;
} = {}): Promise<{ results: Transcription[]; count: number; next: string | null; previous: string | null }> {
  const localItems = getLocalHistory();
  try {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.language && params.language !== 'all') query.set('language', params.language);
    if (params.is_favorite !== undefined) query.set('is_favorite', String(params.is_favorite));
    if (params.date_from) query.set('date_from', params.date_from);
    if (params.date_to) query.set('date_to', params.date_to);
    if (params.ordering) query.set('ordering', params.ordering);
    if (params.page) query.set('page', String(params.page));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${API_BASE_URL}/api/transcriptions/?${query.toString()}`, {
      headers: getHeaders({ 'Accept': 'application/json' }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const serverResults: Transcription[] = Array.isArray(data) ? data : data.results || [];
      // Sync local items with server items
      const serverIds = new Set(serverResults.map((s) => s.id));
      const merged = [...serverResults, ...localItems.filter((l) => !serverIds.has(l.id))];
      return { results: merged, count: merged.length, next: null, previous: null };
    }
  } catch (err) {
    console.warn('Network notice fetching transcriptions, using local history:', err);
  }

  // Filter local items if offline
  let filtered = [...localItems];
  if (params.search) {
    const s = params.search.toLowerCase();
    filtered = filtered.filter((i) => i.title.toLowerCase().includes(s) || i.text.toLowerCase().includes(s));
  }
  if (params.language && params.language !== 'all') {
    filtered = filtered.filter((i) => i.language === params.language);
  }
  return { results: filtered, count: filtered.length, next: null, previous: null };
}

export async function fetchTranscription(id: string): Promise<Transcription> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/transcriptions/${id}/`, {
      headers: getHeaders({ 'Accept': 'application/json' }),
    });
    if (res.ok) return res.json();
  } catch {}
  const local = getLocalHistory().find((l) => l.id === id);
  if (local) return local;
  throw new Error(`Failed to fetch transcription`);
}

export async function createTranscription(payload: Partial<Transcription>): Promise<Transcription> {
  const cleanTitle = payload.title || (payload.text ? payload.text.trim().split(/\s+/).slice(0, 6).join(' ') : 'Live Recording');
  const fallbackRecord: Transcription = {
    id: 'local_' + crypto.randomUUID(),
    device_session_id: getOrCreateSessionId(),
    title: cleanTitle,
    text: payload.text || '',
    language: payload.language || 'en-IN',
    detected_languages: [payload.language || 'en-IN'],
    engine: payload.engine || 'browser-webspeech',
    duration_seconds: payload.duration_seconds || 0,
    word_count: payload.text ? payload.text.trim().split(/\s+/).filter(Boolean).length : 0,
    is_favorite: false,
    is_archived: false,
    share_token: crypto.randomUUID(),
    is_public: false,
    key_points: [],
    action_items: [],
    translation: {},
    created_at: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API_BASE_URL}/api/transcriptions/`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json', 'Accept': 'application/json' }),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      saveToLocalHistory(data);
      return data;
    }
  } catch (err) {
    console.warn('Network notice saving transcription, saved safely to local storage:', err);
  }

  // Always save safely to local storage so user NEVER sees "Failed to fetch"
  saveToLocalHistory(fallbackRecord);
  return fallbackRecord;
}

export async function updateTranscription(id: string, payload: Partial<Transcription>): Promise<Transcription> {
  const res = await fetch(`${API_BASE_URL}/api/transcriptions/${id}/`, {
    method: 'PATCH',
    headers: getHeaders({ 'Content-Type': 'application/json', 'Accept': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update transcription: ${res.statusText}`);
  return res.json();
}

export async function deleteTranscription(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/transcriptions/${id}/`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete transcription: ${res.statusText}`);
}

export async function bulkDeleteTranscriptions(ids: string[]): Promise<number> {
  const res = await fetch(`${API_BASE_URL}/api/transcriptions/bulk_delete/`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`Failed to bulk delete: ${res.statusText}`);
  const data = await res.json();
  return data.deleted || 0;
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/transcriptions/${id}/toggle_favorite/`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to toggle favorite: ${res.statusText}`);
  const data = await res.json();
  return data.is_favorite;
}

export async function uploadAudio(id: string, audioBlob: Blob): Promise<Transcription> {
  const formData = new FormData();
  const extension = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
  formData.append('audio_file', audioBlob, `recording_${id}.${extension}`);

  const res = await fetch(`${API_BASE_URL}/api/transcriptions/${id}/audio/`, {
    method: 'POST',
    headers: getHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error(`Failed to upload audio: ${res.statusText}`);
  return res.json();
}

export async function transcribeAudioFile(
  audioBlob: Blob,
  language = 'ta-IN',
  overrideKey?: string
): Promise<{ text: string; word_count: number; gemini_active?: boolean }> {
  const formData = new FormData();
  const extension = audioBlob.type.includes('mp4')
    ? 'm4a'
    : audioBlob.type.includes('wav')
    ? 'wav'
    : audioBlob.type.includes('mp3')
    ? 'mp3'
    : 'webm';
  formData.append('audio_file', audioBlob, `recording_sample.${extension}`);
  formData.append('language', language);
  const geminiKey = overrideKey || getStoredGeminiKey();
  if (geminiKey) {
    formData.append('api_key', geminiKey);
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/transcriptions/transcribe_audio/`, {
      method: 'POST',
      headers: {
        'X-Session-ID': getOrCreateSessionId(),
      },
      body: formData,
    });
    if (res.ok) {
      return res.json();
    }
  } catch (err) {
    console.warn('transcribeAudioFile notice:', err);
  }
  return { text: '', word_count: 0, gemini_active: Boolean(geminiKey) };
}

export async function toggleShare(id: string, isPublic?: boolean): Promise<{ is_public: boolean; share_token: string; share_path: string }> {
  const res = await fetch(`${API_BASE_URL}/api/transcriptions/${id}/share/`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(isPublic !== undefined ? { is_public: isPublic } : {}),
  });
  if (!res.ok) throw new Error(`Failed to toggle share: ${res.statusText}`);
  return res.json();
}

export async function fetchPublicTranscription(token: string): Promise<Transcription> {
  const res = await fetch(`${API_BASE_URL}/api/public/share/${token}/`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Public transcription not found or unavailable`);
  return res.json();
}

export async function analyzeTranscription(id: string, targetLanguage = 'en'): Promise<Transcription> {
  const geminiKey = getStoredGeminiKey();
  const res = await fetch(`${API_BASE_URL}/api/transcriptions/${id}/analyze/`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ target_language: targetLanguage, api_key: geminiKey }),
  });
  if (!res.ok) throw new Error(`Failed to analyze transcription: ${res.statusText}`);
  return res.json();
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE_URL}/api/stats/`, {
    headers: getHeaders({ 'Accept': 'application/json' }),
  });
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.statusText}`);
  return res.json();
}

export async function fetchSettings(): Promise<UserSettings> {
  const res = await fetch(`${API_BASE_URL}/api/settings/`, {
    headers: getHeaders({ 'Accept': 'application/json' }),
  });
  if (!res.ok) throw new Error(`Failed to fetch settings: ${res.statusText}`);
  return res.json();
}

export async function updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  const res = await fetch(`${API_BASE_URL}/api/settings/`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Failed to update settings: ${res.statusText}`);
  return res.json();
}

export function getExportUrl(id: string, format: 'txt' | 'pdf' | 'json' | 'srt'): string {
  const sessionParam = encodeURIComponent(getOrCreateSessionId());
  return `${API_BASE_URL}/api/transcriptions/${id}/export/?format=${format}&session_id=${sessionParam}`;
}
