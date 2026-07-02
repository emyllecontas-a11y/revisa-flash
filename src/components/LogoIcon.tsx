import { Zap } from "lucide-react";

interface LogoIconProps {
  className?: string;
  size?: number;
}

export function LogoIcon({ className = "", size = 40 }: LogoIconProps) {
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 rounded-full bg-accent/40 blur-2xl animate-pulse"
        style={{ animationDuration: "2s" }}
      />
      <div className="relative z-10 grid h-full w-full place-items-center rounded-full bg-accent/10 backdrop-blur-sm border border-accent/30 shadow-[0_0_30px_rgba(251,113,133,0.5)]">
        <Zap
          className="text-accent drop-shadow-[0_0_20px_rgba(251,113,133,0.9)]"
          size={size * 0.6}
          strokeWidth={2.5}
          fill="#FB7185"
          fillOpacity={0.2}
        />
      </div>
    </div>
  );
}