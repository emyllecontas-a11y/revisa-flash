import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient'; // ajuste se seu caminho for diferente
import { UserAvatar } from '@/components/ui/UserAvatar';
import avatarCatalog from '@/data/avatar-catalog.json';

interface SeletorAvatarProps {
  userId: string;
  fotoUrl: string | null;
  onAtualizar: (tipo: 'foto' | 'avatar', id: string | null) => void;
}

export function SeletorAvatar({ userId, fotoUrl, onAtualizar }: SeletorAvatarProps) {
  const [avatarTipo, setAvatarTipo] = useState<'foto' | 'avatar'>('foto');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregarEscolha() {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_tipo, avatar_id')
        .eq('id', userId)
        .single();
      
      if (data) {
        setAvatarTipo(data.avatar_tipo || 'foto');
        setAvatarId(data.avatar_id || null);
      }
    }
    carregarEscolha();
  }, [userId]);

  const handleSalvar = async (novoTipo: 'foto' | 'avatar', novoId: string | null = null) => {
    setSalvando(true);
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_tipo: novoTipo, avatar_id: novoId })
      .eq('id', userId);

    if (!error) {
      setAvatarTipo(novoTipo);
      setAvatarId(novoId);
      onAtualizar(novoTipo, novoId); // Avisa a tela de configurações para atualizar a prévia
    } else {
      alert("Erro ao salvar avatar. Tente novamente.");
    }
    setSalvando(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center p-4 border border-border/40 rounded-xl bg-surface">
        <UserAvatar 
          fotoUrl={fotoUrl} 
          avatarTipo={avatarTipo} 
          avatarId={avatarId} 
          className="h-20 w-20 mb-2" 
        />
        <p className="text-sm font-medium text-foreground">
          {avatarTipo === 'avatar' 
            ? avatarCatalog.avatares.find(a => a.id === avatarId)?.nome || 'Lumi' 
            : 'Sua Foto'}
        </p>
      </div>

      <div className="flex gap-2 w-full mb-4">
        <button 
          onClick={() => handleSalvar('foto')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
            avatarTipo === 'foto' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface border-border text-foreground/70'
          }`}
        >
          Minha Foto
        </button>
        <button 
          onClick={() => handleSalvar('avatar', avatarId || 'lumi-mascote-base')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
            avatarTipo === 'avatar' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface border-border text-foreground/70'
          }`}
        >
          Avatares Lumi
        </button>
      </div>

      {avatarTipo === 'avatar' && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {avatarCatalog.avatares.map((av) => (
            <button
              key={av.id}
              onClick={() => handleSalvar('avatar', av.id)}
              disabled={salvando}
              className={`flex flex-col items-center p-2 rounded-xl transition-all border-2 ${
                (avatarId === av.id && avatarTipo === 'avatar') 
                  ? 'border-primary bg-primary/10' 
                  : 'border-transparent hover:bg-surface-2'
              }`}
            >
              <div className="h-12 w-12 rounded-full overflow-hidden bg-white mb-1 shadow-sm">
                {/* Carrega a imagem do catálogo */}
                <img 
                  src={new URL(`../../assets/${av.arquivo}`, import.meta.url).href} 
                  alt={av.nome} 
                  className="h-full w-full object-cover" 
                />
              </div>
              <span className="text-[10px] text-center font-medium leading-tight line-clamp-1">{av.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}