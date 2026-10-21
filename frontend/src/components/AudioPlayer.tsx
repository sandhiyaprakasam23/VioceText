import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2 } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  title?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, title = 'Recording' }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const speeds = [1, 1.25, 1.5, 2];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const cycleSpeed = () => {
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-cyber-card/90 border border-cyber-primary/25 rounded-2xl p-3 flex flex-col gap-2 backdrop-blur-md shadow-sm">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-3">
        {/* Play / Pause button */}
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-cyber-primary/20 hover:bg-cyber-primary/30 border border-cyber-primary text-cyber-primary flex items-center justify-center transition-all shadow-cyan-glow-sm"
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-cyber-primary" /> : <Play className="w-4 h-4 fill-cyber-primary ml-0.5" />}
        </button>

        {/* Scrubber & Timestamps */}
        <div className="flex-1 flex flex-col justify-center gap-1">
          <div className="relative w-full flex items-center">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-cyan-950/80 rounded-lg appearance-none cursor-pointer accent-cyber-primary focus:outline-none"
              style={{
                background: `linear-gradient(to right, #22D3EE ${progressPercent}%, rgba(6, 42, 51, 0.8) ${progressPercent}%)`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-cyber-muted font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Speed toggle */}
        <button
          onClick={cycleSpeed}
          className="px-2 py-1 text-xs font-mono rounded-lg border border-cyber-primary/30 text-cyber-primary hover:bg-cyber-primary/10 transition-colors"
          title="Change playback speed"
        >
          {playbackRate}x
        </button>

        {/* Download button */}
        <a
          href={src}
          download={`${title}.webm`}
          className="p-2 rounded-lg text-cyber-muted hover:text-cyber-primary hover:bg-cyber-primary/10 transition-colors"
          title="Download audio recording"
          aria-label="Download audio recording"
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
};
