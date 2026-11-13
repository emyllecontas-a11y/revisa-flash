import { useEffect, useRef } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { RotateCcw, RotateCw } from 'lucide-react';

interface AulaPlayerProps {
  teraboxUrl: string;
  aulaId: string;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  initialTime?: number;
}

export function AulaPlayer({ teraboxUrl, aulaId, onTimeUpdate, initialTime = 0 }: AulaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);
  const hasRestoredTime = useRef(false);

  useEffect(() => {
    hasRestoredTime.current = false;
  }, [aulaId]);

  useEffect(() => {
    if (!videoRef.current) return;

    playerRef.current = new Plyr(videoRef.current, {
      controls: [
        'play-large', 'play', 'progress', 'current-time', 'mute',
        'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
      ],
      settings: ['captions', 'quality', 'speed'],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4] },
    });

    const videoEl = videoRef.current;

    const handleLoadedMetadata = () => {
      if (initialTime > 0 && !hasRestoredTime.current) {
        videoEl.currentTime = initialTime;
        hasRestoredTime.current = true;
      }
    };

    const handleTimeUpdate = () => {
      if (onTimeUpdate && videoEl) {
        onTimeUpdate(videoEl.currentTime, videoEl.duration || 0);
      }
    };

    videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoEl.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoEl.removeEventListener('timeupdate', handleTimeUpdate);
      if (playerRef.current) playerRef.current.destroy();
    };
  }, [teraboxUrl, aulaId]);

  const handleRewind = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
    }
  };

  const handleForward = () => {
    if (videoRef.current && videoRef.current.duration) {
      videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 10);
    }
  };

  return (
    <div className="relative group">
      <div className="rf-au-player relative aspect-video w-full overflow-hidden bg-black shadow-lg">
        <video ref={videoRef} className="w-full h-full" playsInline controls key={teraboxUrl}>
          <source src={teraboxUrl} type="video/mp4" />
        </video>
      </div>
      {/* Botões rápidos de -10s e +10s */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10">
        <button
          type="button"
          onClick={handleRewind}
          title="Voltar 10 segundos"
          className="flex items-center gap-1 text-xs font-semibold text-white hover:text-primary transition-colors px-1.5 py-0.5 rounded"
        >
          <RotateCcw className="h-3.5 w-3.5" /> -10s
        </button>
        <span className="text-white/30">|</span>
        <button
          type="button"
          onClick={handleForward}
          title="Avançar 10 segundos"
          className="flex items-center gap-1 text-xs font-semibold text-white hover:text-primary transition-colors px-1.5 py-0.5 rounded"
        >
          +10s <RotateCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}