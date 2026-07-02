// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";

console.log("🚀 Clerk Webhook Function iniciada!");

// ============================================================
// FUNÇÃO PRINCIPAL – recebe o webhook do Clerk
// ============================================================
Deno.serve(async (req) => {
  try {
    // 1. Verifica se é uma requisição POST
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // 2. Lê o corpo da requisição
    const payload = await req.json();
    const eventType = payload.type;

    console.log(`📨 Evento recebido: ${eventType}`);

    // 3. Só processa eventos de criação de usuário
    if (eventType !== "user.created") {
      return new Response(`Evento ${eventType} ignorado`, { status: 200 });
    }

    // 4. Extrai o ID do usuário
    const userId = payload.data.id;
    if (!userId) {
      console.error("❌ User ID não encontrado no payload");
      return new Response("User ID não encontrado", { status: 400 });
    }

    console.log(`👤 Novo usuário criado: ${userId}`);

    // 5. Calcula a data de expiração (30 dias a partir de agora)
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    console.log(`📅 Trial expira em: ${trialEndsAt}`);

    // 6. Obtém a Secret Key do Clerk das variáveis de ambiente
    const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY");
    if (!CLERK_SECRET_KEY) {
      console.error("❌ CLERK_SECRET_KEY não configurada");
      return new Response("CLERK_SECRET_KEY não configurada", { status: 500 });
    }

    // 7. Atualiza os metadados públicos do usuário no Clerk
    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${userId}/metadata`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        public_metadata: {
          trialEndsAt: trialEndsAt,
        },
      }),
    });

    if (!clerkRes.ok) {
      const errorText = await clerkRes.text();
      console.error(`❌ Erro ao atualizar metadados (${clerkRes.status}):`, errorText);
      return new Response(`Erro ao atualizar metadados: ${errorText}`, { status: 500 });
    }

    console.log(`✅ Metadados atualizados para usuário ${userId}: trialEndsAt = ${trialEndsAt}`);
    return new Response(JSON.stringify({ success: true, trialEndsAt }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ Erro no webhook:", error);
    return new Response(`Erro interno: ${error.message}`, { status: 500 });
  }
});

/* Para testar localmente:

  1. Rode `supabase start` (veja: https://supabase.com/docs/reference/cli/supabase-start)
  2. Faça uma requisição HTTP:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/clerk-webhook' \
    --header 'Content-Type: application/json' \
    --data '{
      "type": "user.created",
      "data": {
        "id": "user_test_123"
      }
    }'
*/