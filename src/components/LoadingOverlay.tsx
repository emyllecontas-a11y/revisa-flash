// src/components/LoadingOverlay.tsx
import React from 'react';
import { Zap } from 'lucide-react';

export function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative flex items-center justify-center">
        {/* Glow pulsante */}
        <div className="absolute inset-0 rounded-full bg-accent/30 blur-3xl animate-pulse" />

        {/* Ícone do raio com animação de escala */}
        <div className="relative z-10 animate-bounce-slow">
          <Zap
            className="text-accent drop-shadow-[0_0_30px_rgba(251,113,133,0.8)]"
            size={64}
            strokeWidth={2.5}
            fill="#FB7185"
            fillOpacity={0.2}
          />
        </div>
      </div>
    </div>
  );
}