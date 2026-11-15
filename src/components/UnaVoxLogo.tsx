import logoCompleta from "@/assets/unavox-logo-completa.png";
import simbolo from "@/assets/unavox-simbolo.png";
import wordmark from "@/assets/unavox-wordmark.png";

type UnaVoxLogoProps = {
  variant?: "completa" | "simbolo" | "wordmark";
  className?: string;
};

export function UnaVoxLogo({ variant = "completa", className }: UnaVoxLogoProps) {
  const src = variant === "simbolo" ? simbolo : variant === "wordmark" ? wordmark : logoCompleta;
  const alt = variant === "simbolo" ? "Símbolo Una Vox" : variant === "wordmark" ? "Una Vox" : "Una Vox";
  return <img src={src} alt={alt} className={className} />;
}

export default UnaVoxLogo;
