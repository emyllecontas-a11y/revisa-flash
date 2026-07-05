// supabase/functions/clerk-search-user/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Clerk } from 'https://esm.sh/@clerk/backend@0.35.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const secretKey = Deno.env.get('CLERK_SECRET_KEY');
    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: 'CLERK_SECRET_KEY não definida' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clerk = new Clerk({ secretKey });

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Método não permitido' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { email } = await req.json();
    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'E-mail inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const users = await clerk.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });

    if (users.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Usuário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = users[0];
    return new Response(
      JSON.stringify({ userId: user.id, email: user.emailAddresses[0]?.emailAddress }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro na Edge Function clerk-search-user:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno ao buscar usuário' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});