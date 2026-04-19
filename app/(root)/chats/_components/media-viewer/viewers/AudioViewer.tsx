'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ViewerProps } from '../viewer-types';

function formatTime(secs: number) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const BAR_HEIGHTS = Array.from(
  { length: 48 },
  (_, i) => 20 + Math.abs(Math.sin(i * 0.8) * 30 + Math.sin(i * 0.3) * 25),
);

export const AudioViewer: React.FC<ViewerProps> = ({ url, caption }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) { audio.play(); setPlaying(true); }
    else { audio.pause(); setPlaying(false); }
  }, []);

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setCurrentTime(audio.currentTime);
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setDuration(audio.duration);
  }, []);

  const onEnded = useCallback(() => setPlaying(false), []);

  const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Number(e.target.value);
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  }, []);

  const changeVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const vol = Number(e.target.value);
    audio.volume = vol;
    setVolume(vol);
    setMuted(vol === 0);
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full h-full flex items-center justify-center p-6 sm:p-10">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        preload="metadata"
        className="hidden"
        aria-label={caption || 'Audio'}
      />

      <div className="w-full max-w-lg flex flex-col gap-8">
        {/* Waveform visualization */}
        <div className="flex items-center justify-center gap-[3px] h-20">
          {BAR_HEIGHTS.map((height, i) => {
            const isPlayed = (i / BAR_HEIGHTS.length) * 100 < progress;
            const isActive = playing && Math.abs((i / BAR_HEIGHTS.length) * 100 - progress) < 5;
            return (
              <div
                key={i}
                className={cn(
                  'rounded-full transition-colors duration-150',
                  isPlayed ? 'bg-blue-400' : 'bg-white/15',
                  isActive && 'bg-blue-300 scale-110',
                )}
                style={{
                  width: 3,
                  height: `${height}%`,
                  transitionProperty: 'background-color, transform',
                }}
              />
            );
          })}
        </div>

        {/* Caption */}
        {caption && (
          <p className="text-white/50 text-sm text-center truncate">{caption}</p>
        )}

        {/* Play / Pause */}
        <div className="flex flex-col items-center gap-4">
          <Button
            onClick={toggle}
            className="h-16 w-16 rounded-full bg-blue-500 hover:bg-blue-400 active:scale-95 text-white shadow-xl transition-transform"
            size="icon"
            aria-label={playing ? 'Pausar' : 'Reproducir'}
          >
            {playing ? (
              <Pause className="h-7 w-7" />
            ) : (
              <Play className="h-7 w-7 ml-0.5" />
            )}
          </Button>
        </div>

        {/* Seekbar */}
        <div className="flex flex-col gap-1.5">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={seek}
            className="w-full h-1.5 rounded-full cursor-pointer accent-blue-400"
            style={{
              background: `linear-gradient(to right, rgb(96 165 250) ${progress}%, rgba(255,255,255,0.15) ${progress}%)`,
            }}
            aria-label="Posición de reproducción"
          />
          <div className="flex justify-between text-white/40 text-xs tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 shrink-0"
            onClick={toggleMute}
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={changeVolume}
            className="flex-1 h-1.5 rounded-full cursor-pointer accent-blue-400"
            style={{
              background: `linear-gradient(to right, rgb(96 165 250) ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(muted ? 0 : volume) * 100}%)`,
            }}
            aria-label="Volumen"
          />
        </div>
      </div>
    </div>
  );
};
