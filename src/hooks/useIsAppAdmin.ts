// src/hooks/useIsAppAdmin.ts
//
// Diz se o usuário logado é ADMINISTRADOR do app (cadastrado na tabela app_admins).
// Administrador pode criar/reordenar aulas e anexar/remover materiais de apoio;
// os demais usuários só assistem e baixam.
//
// Isto só controla o que aparece na tela. Quem de fato BLOQUEIA é o banco (regras RLS na
// migração 20261126_aulas_compartilhadas.sql), então esconder o botão não é "segurança"
// — é só para não mostrar ao aluno algo que ele não pode usar.

import { useEffect, useState } from "react";
import { getSupabaseWithToken } from "@/lib/supabaseClient";
import { useAppUser } from "@/contexts/UserContext";

const chaveCache = (userId: string) => `unavox_is_admin_${userId}`;

function lerCache(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(chaveCache(userId)) === "1";
  } catch {
    return false;
  }
}

export function useIsAppAdmin(): boolean {
  const { userId } = useAppUser();
  // Começa com o último valor conhecido neste aparelho (funciona offline e evita "piscar").
  const [isAdmin, setIsAdmin] = useState<boolean>(() => lerCache(userId));

  useEffect(() => {
    setIsAdmin(lerCache(userId));
    if (!userId) return;
    let cancelado = false;

    (async () => {
      try {
        const supabase = await getSupabaseWithToken();
        const { data, error } = await supabase
          .from("app_admins")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelado || error) return; // erro (offline, tabela ainda não criada): mantém o valor salvo
        const admin = !!data;
        setIsAdmin(admin);
        try {
          localStorage.setItem(chaveCache(userId), admin ? "1" : "0");
        } catch {
          /* ignora */
        }
      } catch {
        /* sem token/offline: mantém o valor salvo */
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [userId]);

  return isAdmin;
}
