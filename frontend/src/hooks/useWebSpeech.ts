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
  const accumulatedTextRef = useRef('');

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
      recognition.lang = targetLang === 'multilingual' ? 'en-IN' : targetLang;
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
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalChunk) {
          accumulatedTextRef.current += finalChunk;
          onTranscriptUpdate(accumulatedTextRef.current.trim(), true);
        } else if (interimTranscript) {
          const preview = (accumulatedTextRef.current + ' ' + interimTranscript).trim();
          onTranscriptUpdate(preview, false);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech') {
          // Normal timeout if user was silent for a second, ignore
          return;
        }
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please allow microphone permissions.');
        } else {
          setError(`Speech recognition notice: ${event.error}`);
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
    accumulatedTextRef.current = '';
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
