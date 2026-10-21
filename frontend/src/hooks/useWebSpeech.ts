import { useState, useRef, useCallback, useEffect } from 'react';

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
  const sessionBaseTextRef = useRef(''); // Finalized text preserved across speech sessions
  const currentSessionFinalRef = useRef(''); // Finalized text in current active recognition object
  const currentLanguageRef = useRef(language);

  // Sync language ref whenever language changes
  useEffect(() => {
    currentLanguageRef.current = language;
  }, [language]);

  const isSupported = typeof window !== 'undefined' && Boolean(
    (window as IWindow).SpeechRecognition || (window as IWindow).webkitSpeechRecognition
  );

  const startListening = useCallback((langToUse?: string) => {
    if (!isSupported) {
      setError('Web Speech recognition is not supported in this browser. Please use Google Chrome, Edge, or Safari.');
      return false;
    }

    // Terminate any previous instance cleanly
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

    const targetLang = langToUse || currentLanguageRef.current || 'ta-IN';
    const cleanLang = targetLang === 'multilingual' ? 'ta-IN' : targetLang;

    const createAndStart = () => {
      if (!shouldListenRef.current) return;

      try {
        const SpeechRecognitionClass = (window as IWindow).SpeechRecognition || (window as IWindow).webkitSpeechRecognition;
        const recognition = new SpeechRecognitionClass();

        recognition.lang = cleanLang;
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

        recognition.onresult = (event: any) => {
          let interimText = '';
          let finalText = '';

          for (let i = 0; i < event.results.length; ++i) {
            const res = event.results[i];
            if (res && res[0]) {
              const text = res[0].transcript || '';
              if (res.isFinal) {
                finalText += text + ' ';
              } else {
                interimText += text;
              }
            }
          }

          currentSessionFinalRef.current = finalText;

          const fullCombined = [
            sessionBaseTextRef.current,
            finalText,
            interimText
          ]
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (fullCombined) {
            onTranscriptUpdate(fullCombined);
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
          // If user didn't click stop, accumulate finalized text and start a fresh instance
          if (shouldListenRef.current) {
            if (currentSessionFinalRef.current) {
              sessionBaseTextRef.current = [sessionBaseTextRef.current, currentSessionFinalRef.current]
                .filter(Boolean)
                .join(' ')
                .trim();
              currentSessionFinalRef.current = '';
            }
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
  }, [isSupported, onTranscriptUpdate]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    setIsListening(false);
    setIsSpeaking(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    if (currentSessionFinalRef.current) {
      sessionBaseTextRef.current = [sessionBaseTextRef.current, currentSessionFinalRef.current]
        .filter(Boolean)
        .join(' ')
        .trim();
      currentSessionFinalRef.current = '';
    }
  }, []);

  const resetTranscript = useCallback(() => {
    sessionBaseTextRef.current = '';
    currentSessionFinalRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
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
