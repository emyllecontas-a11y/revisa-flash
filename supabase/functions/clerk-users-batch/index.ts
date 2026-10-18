// supabase/functions/clerk-users-batch/index.ts
//
// Devolve nome e e-mail a partir de IDs. AGORA:
//  - exige usuária logada (token do Clerk);
//  - só devolve pessoas "conhecidas" de quem pergunta: ela mesma, amigas
//    (ou convites), quem compartilhou/recebeu algo dela e membros dos decks
//    dela (para a tela de flashcards continuar funcionando como hoje);
//  - no máximo 100 IDs por chamada.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Clerk } from 'https://esm.sh/@clerk/backend@0.35.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

const MAX_IDS = 100;
const ID_VALIDO = /^[A-Za-z0-9_\-:.]{1,64}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getCallerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
  );
  const { data, error } = await sb.rpc('get_user_id');
  if (error || !data || typeof data !== 'string') return null;
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido' }, 405);
  }

  try {
    const callerId = await getCallerId(req);
    if (!callerId || !ID_VALIDO.test(callerId)) {
      return json({ error: 'Não autenticado' }, 401);
    }

    const secretKey = Deno.env.get('CLERK_SECRET_KEY');
    if (!secretKey) {
      console.error('CLERK_SECRET_KEY não definida');
      return json({ error: 'Erro interno ao buscar usuários' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const pedidos: string[] = Array.isArray(body?.userIds)
      ? Array.from(new Set(body.userIds.filter((x: unknown) => typeof x === 'string' && ID_VALIDO.test(x as string))))
      : [];

    if (pedidos.length === 0) {
      return json({ error: 'Lista de IDs inválida' }, 400);
    }
    if (pedidos.length > MAX_IDS) {
      return json({ error: `No máximo ${MAX_IDS} IDs por vez` }, 400);
    }

    // ---- quem a pessoa "conhece" ----
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const permitidos = new Set<string>([callerId]);

    const [amizades, compartilhamentos, decks] = await Promise.all([
      admin
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${callerId},addressee_id.eq.${callerId}`),
      admin
        .from('shares')
        .select('owner_id, shared_with_id')
        .or(`owner_id.eq.${callerId},shared_with_id.eq.${callerId}`),
      admin
        .from('decks')
        .select('user_id, owner_id, shared_with')
        .or(`user_id.eq.${callerId},owner_id.eq.${callerId},shared_with.cs.{${callerId}}`),
    ]);

    for (const f of amizades.data ?? []) {
      permitidos.add(f.requester_id);
      permitidos.add(f.addressee_id);
    }
    for (const s of compartilhamentos.data ?? []) {
      permitidos.add(s.owner_id);
      permitidos.add(s.shared_with_id);
    }
    for (const d of decks.data ?? []) {
      if (d.user_id) permitidos.add(d.user_id);
      if (d.owner_id) permitidos.add(d.owner_id);
      for (const m of d.shared_with ?? []) permitidos.add(m);
    }

    const ids = pedidos.filter((id) => permitidos.has(id));
    if (ids.length === 0) {
      return json({ users: [] });
    }

    // ---- busca no Clerk só dos IDs permitidos ----
    const clerk = new Clerk({ secretKey });
    const users = await clerk.users.getUserList({ userId: ids, limit: ids.length });

    const result = users.map((user) => ({
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || null,
      name:
        `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.id,
    }));

    return json({ users: result });
  } catch (error) {
    console.error('Erro na Edge Function clerk-users-batch:', error);
    return json({ error: 'Erro interno ao buscar usuários' }, 500);
  }
});