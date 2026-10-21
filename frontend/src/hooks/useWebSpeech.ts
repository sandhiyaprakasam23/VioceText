import { useState, useRef, useCallback, useEffect } from 'react';

// Declare types for Web Speech API
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export function useWebSpeech({
  language = 'en-IN',
  onTranscriptUpdate,
}: {
  language: string;
  onTranscriptUpdate: (text: string, isFinal: boolean) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const fullTranscriptRef = useRef('');

  // Check browser support
  const isSupported = typeof window !== 'undefined' && Boolean(
    (window as IWindow).SpeechRecognition || (window as IWindow).webkitSpeechRecognition
  );

  const startListening = useCallback((initialLanguage?: string) => {
    if (!isSupported) {
      setError('Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return false;
    }

    try {
      const SpeechRecognitionClass = (window as IWindow).SpeechRecognition || (window as IWindow).webkitSpeechRecognition;
      const recognition = new SpeechRecognitionClass();
      
      const targetLang = initialLanguage || language;
      recognition.lang = targetLang === 'multilingual' ? 'ta-IN' : targetLang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
        shouldListenRef.current = true;
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';
        let currentSessionFinal = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item && item[0]) {
            const transcript = item[0].transcript;
            if (item.isFinal) {
              currentSessionFinal += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }
        }

        if (currentSessionFinal) {
          fullTranscriptRef.current = (fullTranscriptRef.current + ' ' + currentSessionFinal).trim();
        }

        const combined = (fullTranscriptRef.current + ' ' + interimTranscript).trim();
        if (combined) {
          onTranscriptUpdate(combined, Boolean(currentSessionFinal));
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech') {
          return;
        }
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please allow microphone permissions.');
        } else {
          console.warn('Speech recognition notice:', event.error);
        }
      };

      recognition.onend = () => {
        // Auto-restart if user did not click Stop
        if (shouldListenRef.current) {
          try {
            recognition.start();
          } catch {
            setIsListening(false);
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      return true;
    } catch (err: any) {
      setError(err?.message || 'Failed to start Web Speech recognition');
      setIsListening(false);
      return false;
    }
  }, [isSupported, language, onTranscriptUpdate]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    fullTranscriptRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
