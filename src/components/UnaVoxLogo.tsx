import logoCompleta from "@/assets/unavox-logo-completa.png";
import simbolo from "@/assets/unavox-simbolo.png";

type UnaVoxLogoProps = {
  variant?: "completa" | "simbolo";
  className?: string;
};

export function UnaVoxLogo({ variant = "completa", className }: UnaVoxLogoProps) {
  const src = variant === "simbolo" ? simbolo : logoCompleta;
  const alt = variant === "simbolo" ? "Símbolo Una Vox" : "Una Vox";
  return <img src={src} alt={alt} className={className} />;
}

export default UnaVoxLogo;
