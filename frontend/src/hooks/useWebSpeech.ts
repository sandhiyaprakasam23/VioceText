import { useState, useRef, useCallback, useEffect } from 'react';
import { translateLiveText, isPureEnglish, containsTamil } from '../services/translator';

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export function useWebSpeech({
  language = 'ta-IN',
  onTranscriptUpdate,
}: {
  language: string;
  onTranscriptUpdate: (text: string) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);

  // Translation accumulators
  const translatedBaseTextRef = useRef(''); // Finalized text across restarts
  const translatedFinalTextRef = useRef(''); // Finalized text in current session
  const translatedInterimTextRef = useRef(''); // Interim text being spoken now
  const lastTranslatedFinalRawRef = useRef(''); // Deduplicate final translations
  const interimSeqRef = useRef(0);
  const interimDebounceTimerRef = useRef<number | null>(null);

  const currentLanguageRef = useRef(language);
  const onTranscriptUpdateRef = useRef(onTranscriptUpdate);

  // Sync references
  useEffect(() => {
    currentLanguageRef.current = language;
  }, [language]);

  useEffect(() => {
    onTranscriptUpdateRef.current = onTranscriptUpdate;
  }, [onTranscriptUpdate]);

  const emitCombinedTranscript = useCallback(() => {
    const combined = [
      translatedBaseTextRef.current,
      translatedFinalTextRef.current,
      translatedInterimTextRef.current,
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (combined) {
      onTranscriptUpdateRef.current(combined);
    }
  }, []);

  const isSupported = typeof window !== 'undefined' && Boolean(
    (window as IWindow).SpeechRecognition || (window as IWindow).webkitSpeechRecognition
  );

  const startListening = useCallback((langToUse?: string) => {
    if (!isSupported) {
      setError('Web Speech recognition is not supported in this browser. Please use Google Chrome, Edge, or Safari.');
      return false;
    }

    // Cleanly terminate any active instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    shouldListenRef.current = true;
    setError(null);

    const targetOutputLang = langToUse || currentLanguageRef.current || 'ta-IN';

    // In Indian/Tamil context, Chrome's 'ta-IN' engine recognizes:
    // 1. Tamil speech ("வணக்கம், எப்படி இருக்கீங்க?"),
    // 2. Code-mixed Tanglish speech,
    // 3. Spoken English words and phrases.
    // When the output language is English, we listen with 'ta-IN' and translate
    // Tamil speech into English in real-time.
    let speechInputLang = targetOutputLang;
    if (
      targetOutputLang === 'multilingual' ||
      targetOutputLang.startsWith('en') ||
      targetOutputLang.startsWith('ta')
    ) {
      speechInputLang = 'ta-IN';
    }

    const createAndStart = () => {
      if (!shouldListenRef.current) return;

      try {
        const SpeechRecognitionClass =
          (window as IWindow).SpeechRecognition || (window as IWindow).webkitSpeechRecognition;
        const recognition = new SpeechRecognitionClass();

        recognition.lang = speechInputLang;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          setIsListening(true);
          setError(null);
        };

        recognition.onspeechstart = () => {
          setIsSpeaking(true);
        };

        recognition.onspeechend = () => {
          setIsSpeaking(false);
        };

        recognition.onsoundstart = () => {
          setIsSpeaking(true);
        };

        recognition.onsoundend = () => {
          setIsSpeaking(false);
        };

        recognition.onresult = async (event: any) => {
          let interimRaw = '';
          let finalRaw = '';

          for (let i = 0; i < event.results.length; ++i) {
            const res = event.results[i];
            if (res && res[0]) {
              const text = res[0].transcript || '';
              if (res.isFinal) {
                finalRaw += text + ' ';
              } else {
                interimRaw += text;
              }
            }
          }

          finalRaw = finalRaw.trim();
          interimRaw = interimRaw.trim();
          const targetLang = currentLanguageRef.current;

          // 1. Handle finalized speech segments
          if (finalRaw && finalRaw !== lastTranslatedFinalRawRef.current) {
            lastTranslatedFinalRawRef.current = finalRaw;

            // If target is English and text is already pure English, 0ms latency
            if (targetLang.startsWith('en') && isPureEnglish(finalRaw)) {
              translatedFinalTextRef.current = finalRaw;
              emitCombinedTranscript();
            } else if (targetLang.startsWith('ta') && containsTamil(finalRaw) && !/[a-zA-Z]/.test(finalRaw)) {
              // If target is Tamil and text is already pure Tamil, 0ms latency
              translatedFinalTextRef.current = finalRaw;
              emitCombinedTranscript();
            } else {
              // Real-time translation to chosen output language
              translateLiveText(finalRaw, targetLang).then((translated) => {
                if (shouldListenRef.current) {
                  translatedFinalTextRef.current = translated;
                  emitCombinedTranscript();
                }
              });
            }
          }

          // 2. Handle live interim speech stream (real-time display while speaking)
          if (!interimRaw) {
            translatedInterimTextRef.current = '';
            emitCombinedTranscript();
          } else {
            // If target is English and interim text is already pure English: instant 0ms update
            if (targetLang.startsWith('en') && isPureEnglish(interimRaw)) {
              translatedInterimTextRef.current = interimRaw;
              emitCombinedTranscript();
            } else if (targetLang.startsWith('ta') && containsTamil(interimRaw) && !/[a-zA-Z]/.test(interimRaw)) {
              // If target is Tamil and interim is pure Tamil: instant 0ms update
              translatedInterimTextRef.current = interimRaw;
              emitCombinedTranscript();
            } else {
              // Debounce interim translation slightly (70ms) to prevent network stutter mid-syllable
              if (interimDebounceTimerRef.current) {
                clearTimeout(interimDebounceTimerRef.current);
              }
              const currentSeq = ++interimSeqRef.current;
              interimDebounceTimerRef.current = window.setTimeout(async () => {
                try {
                  const translated = await translateLiveText(interimRaw, targetLang);
                  if (shouldListenRef.current && currentSeq === interimSeqRef.current) {
                    translatedInterimTextRef.current = translated;
                    emitCombinedTranscript();
                  }
                } catch {
                  // Fallback to raw interim on unexpected error
                  if (shouldListenRef.current && currentSeq === interimSeqRef.current) {
                    translatedInterimTextRef.current = interimRaw;
                    emitCombinedTranscript();
                  }
                }
              }, 70);
            }
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('[WebSpeech] notice/error:', event.error);
          if (event.error === 'no-speech') {
            // User paused speech, keep listening seamlessly
            return;
          }
          if (event.error === 'not-allowed') {
            setError('Microphone permission denied. Please allow microphone access in your browser address bar.');
            shouldListenRef.current = false;
            setIsListening(false);
            return;
          }
          if (event.error === 'audio-capture') {
            setError('Microphone audio capture busy. Please close other recording tabs or wait a second.');
          }
        };

        recognition.onend = () => {
          setIsSpeaking(false);
          // If recording wasn't stopped, commit finalized text and restart cleanly
          if (shouldListenRef.current) {
            if (translatedFinalTextRef.current) {
              translatedBaseTextRef.current = [
                translatedBaseTextRef.current,
                translatedFinalTextRef.current,
              ]
                .filter(Boolean)
                .join(' ')
                .trim();
              translatedFinalTextRef.current = '';
              lastTranslatedFinalRawRef.current = '';
            }
            translatedInterimTextRef.current = '';
            emitCombinedTranscript();

            // 80ms breather before starting fresh instance to avoid browser rate limit
            setTimeout(() => {
              if (shouldListenRef.current) {
                createAndStart();
              }
            }, 80);
          } else {
            setIsListening(false);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        return true;
      } catch (err: any) {
        console.error('[WebSpeech] createAndStart exception:', err);
        setError(err?.message || 'Failed to start speech recognition');
        setIsListening(false);
        return false;
      }
    };

    return createAndStart();
  }, [isSupported, emitCombinedTranscript]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    setIsListening(false);
    setIsSpeaking(false);

    if (interimDebounceTimerRef.current) {
      clearTimeout(interimDebounceTimerRef.current);
      interimDebounceTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    if (translatedFinalTextRef.current) {
      translatedBaseTextRef.current = [
        translatedBaseTextRef.current,
        translatedFinalTextRef.current,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();
      translatedFinalTextRef.current = '';
      lastTranslatedFinalRawRef.current = '';
    }
    translatedInterimTextRef.current = '';
    emitCombinedTranscript();
  }, [emitCombinedTranscript]);

  const resetTranscript = useCallback(() => {
    translatedBaseTextRef.current = '';
    translatedFinalTextRef.current = '';
    translatedInterimTextRef.current = '';
    lastTranslatedFinalRawRef.current = '';
    interimSeqRef.current = 0;
    if (interimDebounceTimerRef.current) {
      clearTimeout(interimDebounceTimerRef.current);
      interimDebounceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (interimDebounceTimerRef.current) {
        clearTimeout(interimDebounceTimerRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    isSpeaking,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
