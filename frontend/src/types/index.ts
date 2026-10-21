export type EngineType = 'gemini-live' | 'browser-webspeech';

export type RecordingState = 'idle' | 'connecting' | 'recording' | 'paused' | 'processing' | 'error';

export interface Transcription {
  id: string;
  device_session_id?: string;
  title: string;
  text: string;
  language: string;
  detected_languages: string[];
  engine: EngineType;
  duration_seconds: number;
  word_count: number;
  audio_file?: string | null;
  audio_url?: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  share_token: string;
  is_public: boolean;
  summary?: string | null;
  key_points: string[];
  action_items: string[];
  translation: {
    en?: string;
    ta?: string;
    hi?: string;
    [key: string]: string | undefined;
  };
  created_at: string;
  updated_at?: string;
}

export interface UserSettings {
  device_session_id: string;
  default_language: string;
  default_engine: EngineType;
  auto_save: boolean;
  save_audio: boolean;
  auto_copy_on_stop: boolean;
  show_timestamps: boolean;
  theme: 'dark' | 'light';
  font_size: 'small' | 'medium' | 'large';
  updated_at?: string;
}

export interface Stats {
  total_sessions: number;
  total_minutes: number;
  total_words: number;
  top_language: string;
}

export interface LanguageOption {
  code: string;
  label: string;
  native: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en-IN', label: 'English (India)', native: 'English' },
  { code: 'ta-IN', label: 'Tamil', native: 'தமிழ்' },
  { code: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
  { code: 'te-IN', label: 'Telugu', native: 'తెలుగు' },
  { code: 'ml-IN', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'kn-IN', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'multilingual', label: 'Multilingual / Mixed', native: 'Tamil + English + Hindi' },
];
