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
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.language && params.language !== 'all') query.set('language', params.language);
  if (params.is_favorite !== undefined) query.set('is_favorite', String(params.is_favorite));
  if (params.date_from) query.set('date_from', params.date_from);
  if (params.date_to) query.set('date_to', params.date_to);
  if (params.ordering) query.set('ordering', params.ordering);
  if (params.page) query.set('page', String(params.page));

  const res = await fetch(`${API_BASE_URL}/api/transcriptions/?${query.toString()}`, {
    headers: getHeaders({ 'Accept': 'application/json' }),
  });
  if (!res.ok) throw new Error(`Failed to fetch transcriptions: ${res.statusText}`);
  const data = await res.json();
  if (Array.isArray(data)) {
    return { results: data, count: data.length, next: null, previous: null };
  }
  return data;
}

export async function fetchTranscription(id: string): Promise<Transcription> {
  const res = await fetch(`${API_BASE_URL}/api/transcriptions/${id}/`, {
    headers: getHeaders({ 'Accept': 'application/json' }),
  });
  if (!res.ok) throw new Error(`Failed to fetch transcription: ${res.statusText}`);
  return res.json();
}

export async function createTranscription(payload: Partial<Transcription>): Promise<Transcription> {
  const res = await fetch(`${API_BASE_URL}/api/transcriptions/`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json', 'Accept': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to save transcription: ${res.statusText}`);
  return res.json();
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
  const res = await fetch(`${API_BASE_URL}/api/transcriptions/${id}/analyze/`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ target_language: targetLanguage }),
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
