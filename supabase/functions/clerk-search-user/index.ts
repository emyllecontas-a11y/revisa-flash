// supabase/functions/clerk-search-user/index.ts
//
// Busca uma pessoa pelo e-mail. AGORA:
//  - exige usuária logada (token do Clerk), validado pelo próprio Supabase;
//  - limita tentativas (20 por hora por pessoa) para ninguém descobrir e-mails por tentativa;
//  - devolve só o mínimo (id, nome, e-mail) e uma resposta neutra quando não encontra.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Clerk } from 'https://esm.sh/@clerk/backend@0.35.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

const MAX_BUSCAS_POR_HORA = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Descobre quem está chamando usando a função get_user_id() do banco.
// O Supabase valida o token; se for inválido ou for só a chave pública, volta null.
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
    if (!callerId) {
      return json({ error: 'Não autenticado' }, 401);
    }

    const secretKey = Deno.env.get('CLERK_SECRET_KEY');
    if (!secretKey) {
      console.error('CLERK_SECRET_KEY não definida');
      return json({ error: 'Erro interno ao buscar usuário' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'E-mail inválido' }, 400);
    }

    // ---- limite de tentativas (usa a chave de serviço, só existe aqui no servidor) ----
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('user_search_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', callerId)
      .gte('created_at', desde);

    if ((count ?? 0) >= MAX_BUSCAS_POR_HORA) {
      return json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429);
    }
    await admin.from('user_search_attempts').insert({ user_id: callerId });

    // ---- busca no Clerk ----
    const clerk = new Clerk({ secretKey });
    const users = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });

    const user = users[0];
    // Não achou, ou achou a própria pessoa: mesma resposta neutra.
    if (!user || user.id === callerId) {
      return json({
        found: false,
        message: 'Se essa pessoa usa o RevisaFlash, ela aparecerá aqui.',
      });
    }

    const nome =
      `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || null;

    return json({
      found: true,
      userId: user.id,
      name: nome,
      email: user.emailAddresses[0]?.emailAddress ?? email,
    });
  } catch (error) {
    console.error('Erro na Edge Function clerk-search-user:', error);
    return json({ error: 'Erro interno ao buscar usuário' }, 500);
  }
});