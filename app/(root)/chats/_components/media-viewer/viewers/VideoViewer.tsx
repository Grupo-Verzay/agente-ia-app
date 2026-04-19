'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ViewerProps } from '../viewer-types';

function formatTime(secs: number) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const VideoViewer: React.FC<ViewerProps> = ({ url, caption }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  const onMouseMove = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
    scheduleHide();
  }, [scheduleHide]);

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (v) setCurrentTime(v.currentTime);
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (v) setDuration(v.duration);
  }, []);

  const onEnded = useCallback(() => {
    setPlaying(false);
    setShowControls(true);
  }, []);

  const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (v) v.currentTime = Number(e.target.value);
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const changeVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const vol = Number(e.target.value);
    v.volume = vol;
    setVolume(vol);
    setMuted(vol === 0);
  }, []);

  const requestFullscreen = useCallback(() => {
    const v = videoRef.current;
    if (v?.requestFullscreen) v.requestFullscreen();
  }, []);

  useEffect(() => {
    scheduleHide();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [scheduleHide]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="relative w-full h-full flex items-center justify-center bg-black"
      onMouseMove={onMouseMove}
    >
      <video
        ref={videoRef}
        src={url}
        className="max-w-full max-h-[80vh] w-full object-contain"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        preload="metadata"
        aria-label={caption || 'Video'}
        onClick={togglePlay}
        style={{ cursor: 'pointer' }}
      />

      {/* Controls overlay */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        {/* Seekbar */}
        <div className="relative w-full mb-2 group">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={seek}
            className="w-full h-1 rounded-full accent-blue-400 cursor-pointer bg-white/20"
            aria-label="Posición de reproducción"
            style={{
              background: `linear-gradient(to right, rgb(96 165 250) ${progress}%, rgba(255,255,255,0.2) ${progress}%)`,
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/10 shrink-0"
            onClick={togglePlay}
            aria-label={playing ? 'Pausar' : 'Reproducir'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          <span className="text-white/70 text-xs tabular-nums shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
              onClick={toggleMute}
              aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={changeVolume}
              className="w-20 h-1 rounded-full accent-blue-400 cursor-pointer bg-white/20 hidden sm:block"
              aria-label="Volumen"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
              onClick={requestFullscreen}
              aria-label="Pantalla completa"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Center play/pause indicator (shows briefly on click) */}
      {!playing && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center"
          aria-label="Reproducir"
          tabIndex={-1}
        >
          <div className="h-16 w-16 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm border border-white/20">
            <Play className="h-7 w-7 text-white ml-1" />
          </div>
        </button>
      )}
    </div>
  );
};
