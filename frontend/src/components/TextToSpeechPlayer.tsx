import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Pause, Play, Square } from 'lucide-react';

interface TextToSpeechPlayerProps {
  text: string;
  language?: string;
  className?: string;
}

export const TextToSpeechPlayer: React.FC<TextToSpeechPlayerProps> = ({
  text,
  language = 'en-IN',
  className = '',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported('speechSynthesis' in window);
  }, []);

  const getMatchedVoice = (langCode: string): SpeechSynthesisVoice | null => {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    const cleanCode = langCode.toLowerCase().replace('_', '-');

    // 1. Exact match e.g. ta-IN or hi-IN
    let matched = voices.find((v) => v.lang.toLowerCase().replace('_', '-') === cleanCode);
    if (matched) return matched;

    // 2. Prefix match e.g. 'ta' or 'hi'
    const prefix = cleanCode.split('-')[0];
    matched = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
    if (matched) return matched;

    // 3. Fallback to default or english
    return voices.find((v) => v.default || v.lang.startsWith('en')) || null;
  };

  const handleSpeak = () => {
    if (!text.trim() || !('speechSynthesis' in window)) return;

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    window.speechSynthesis.cancel(); // Stop any ongoing speech

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getMatchedVoice(language);
    if (voice) utterance.voice = voice;
    utterance.lang = language === 'multilingual' ? 'en-IN' : language;
    utterance.rate = rate;

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handlePause = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
    setIsPlaying(false);
  };

  const handleStop = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
  };

  if (!isSupported) return null;

  return (
    <div className={`inline-flex items-center gap-1.5 bg-cyan-950/40 border border-cyber-primary/25 rounded-xl px-2.5 py-1 text-xs text-cyber-primary ${className}`}>
      {!isPlaying && !isPaused ? (
        <button
          onClick={handleSpeak}
          className="flex items-center gap-1 hover:text-cyan-200 transition-colors"
          title="Read transcript aloud"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Listen</span>
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          {isPlaying ? (
            <button onClick={handlePause} className="hover:text-cyan-200" title="Pause reading">
              <Pause className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={handleSpeak} className="hover:text-cyan-200" title="Resume reading">
              <Play className="w-3.5 h-3.5 fill-cyber-primary" />
            </button>
          )}
          <button onClick={handleStop} className="hover:text-red-400" title="Stop reading">
            <Square className="w-3 h-3 fill-current" />
          </button>
          <span className="text-[10px] font-mono text-cyber-muted animate-pulse">Playing</span>
        </div>
      )}
    </div>
  );
};
