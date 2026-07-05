// supabase/functions/clerk-users-batch/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Clerk } from 'https://esm.sh/@clerk/backend@0.35.0';

// Cabeçalhos CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

serve(async (req) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Verifica se a chave secreta existe
    const secretKey = Deno.env.get('CLERK_SECRET_KEY');
    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: 'CLERK_SECRET_KEY não definida no ambiente' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clerk = new Clerk({ secretKey });

    // Verifica método
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Método não permitido' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Lê corpo
    const { userIds } = await req.json();
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Lista de IDs inválida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Busca usuários no Clerk
    const users = await clerk.users.getUserList({
      userId: userIds,
      limit: Math.min(userIds.length, 500),
    });

    const result = users.map(user => ({
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || null,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.id,
    }));

    return new Response(
      JSON.stringify({ users: result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro na Edge Function batch:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno ao buscar usuários' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});