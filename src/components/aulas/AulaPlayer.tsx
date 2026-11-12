import { useEffect, useRef } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';

interface AulaPlayerProps {
  teraboxUrl: string; // Mantendo o nome da prop para não quebrar a AulasPage
}

export function AulaPlayer({ teraboxUrl }: AulaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    // Inicializa o Plyr diretamente no arquivo MP4 do GitHub
    playerRef.current = new Plyr(videoRef.current, {
      controls: [
        'play-large', 'play', 'progress', 'current-time', 'mute', 
        'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
      ],
      settings: ['captions', 'quality', 'speed'],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4] },
    });

    return () => {
      if (playerRef.current) playerRef.current.destroy();
    };
  }, [teraboxUrl]);

  return (
    <div className="rf-au-player relative aspect-video w-full overflow-hidden bg-black shadow-lg">
      <video ref={videoRef} className="w-full h-full" playsInline controls key={teraboxUrl}>
        <source src={teraboxUrl} type="video/mp4" />
      </video>
    </div>
  );
}