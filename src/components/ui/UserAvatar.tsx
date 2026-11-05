import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Seu componente de avatar atual

// Importando as imagens locais
import lumiMascote from '@/assets/avatars/mascote-base.svg';
import avatar01 from '@/assets/avatars/avatar-01.svg';
import avatar02 from '@/assets/avatars/avatar-02.svg';
import avatar03 from '@/assets/avatars/avatar-03.svg';
import avatar04 from '@/assets/avatars/avatar-04.svg';
import avatar05 from '@/assets/avatars/avatar-05.svg';
import avatar06 from '@/assets/avatars/avatar-06.svg';
import avatar07 from '@/assets/avatars/avatar-07.svg';
import avatar08 from '@/assets/avatars/avatar-08.svg';
import avatar09 from '@/assets/avatars/avatar-09.svg';
import avatar10 from '@/assets/avatars/avatar-10.svg';
import avatar11 from '@/assets/avatars/avatar-11.svg';
import avatar12 from '@/assets/avatars/avatar-12.svg';

// Dicionário para ligar o ID salvo no banco à imagem real
const AVATARES_MAP: Record<string, string> = {
  'lumi-mascote-base': lumiMascote,
  'lumi-avatar-01': avatar01,
  'lumi-avatar-02': avatar02,
  'lumi-avatar-03': avatar03,
  'lumi-avatar-04': avatar04,
  'lumi-avatar-05': avatar05,
  'lumi-avatar-06': avatar06,
  'lumi-avatar-07': avatar07,
  'lumi-avatar-08': avatar08,
  'lumi-avatar-09': avatar09,
  'lumi-avatar-10': avatar10,
  'lumi-avatar-11': avatar11,
  'lumi-avatar-12': avatar12,
};

interface UserAvatarProps {
  fotoUrl?: string | null;
  avatarTipo?: string | null;
  avatarId?: string | null;
  nome?: string;
  className?: string; // Para controlar tamanhos (ex: h-10 w-10)
}

export function UserAvatar({ fotoUrl, avatarTipo, avatarId, nome, className = "h-10 w-10" }: UserAvatarProps) {
  // 1. Se o tipo for avatar e o ID existir, mostra a Lumi
  if (avatarTipo === 'avatar' && avatarId && AVATARES_MAP[avatarId]) {
    return (
      <Avatar className={className}>
        <AvatarImage src={AVATARES_MAP[avatarId]} alt={nome || "Avatar"} className="object-cover bg-muted" />
        <AvatarFallback className="bg-muted">{nome?.charAt(0) || "L"}</AvatarFallback>
      </Avatar>
    );
  }

  // 2. Se não for avatar (ou der erro), tenta mostrar a foto real
  if (fotoUrl) {
    return (
      <Avatar className={className}>
        <AvatarImage src={fotoUrl} alt={nome || "Foto"} className="object-cover" />
        <AvatarFallback className="bg-muted">{nome?.charAt(0) || "U"}</AvatarFallback>
      </Avatar>
    );
  }

  // 3. Fallback: Se não tem nada, mostra a Lumi base (Mascote Oficial)
  return (
    <Avatar className={className}>
      <AvatarImage src={lumiMascote} alt="Lumi, a loba" className="object-cover bg-[#C9B6EE]" />
      <AvatarFallback className="bg-muted">L</AvatarFallback>
    </Avatar>
  );
}