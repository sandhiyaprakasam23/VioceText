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
  region?: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  // Multilingual & Indian Languages
  { code: 'multilingual', label: 'Multilingual / Code-Mixed', native: 'தமிழ் + English + हिन्दी', region: 'India' },
  { code: 'ta-IN', label: 'Tamil', native: 'தமிழ்', region: 'India' },
  { code: 'en-IN', label: 'English (India)', native: 'English (IN)', region: 'India' },
  { code: 'hi-IN', label: 'Hindi', native: 'हिन्दी', region: 'India' },
  { code: 'te-IN', label: 'Telugu', native: 'తెలుగు', region: 'India' },
  { code: 'ml-IN', label: 'Malayalam', native: 'മലയാളം', region: 'India' },
  { code: 'kn-IN', label: 'Kannada', native: 'ಕನ್ನಡ', region: 'India' },
  { code: 'bn-IN', label: 'Bengali', native: 'বাংলা', region: 'India' },
  { code: 'mr-IN', label: 'Marathi', native: 'मराठी', region: 'India' },
  { code: 'gu-IN', label: 'Gujarati', native: 'ગુજરાતી', region: 'India' },
  { code: 'pa-IN', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', region: 'India' },
  { code: 'ur-IN', label: 'Urdu', native: 'اردو', region: 'India' },

  // International Languages
  { code: 'en-US', label: 'English (US)', native: 'English (US)', region: 'International' },
  { code: 'en-GB', label: 'English (UK)', native: 'English (UK)', region: 'International' },
  { code: 'es-ES', label: 'Spanish', native: 'Español', region: 'International' },
  { code: 'fr-FR', label: 'French', native: 'Français', region: 'International' },
  { code: 'de-DE', label: 'German', native: 'Deutsch', region: 'International' },
  { code: 'ar-SA', label: 'Arabic', native: 'العربية', region: 'International' },
  { code: 'ja-JP', label: 'Japanese', native: '日本語', region: 'International' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)', native: '中文', region: 'International' },
];
