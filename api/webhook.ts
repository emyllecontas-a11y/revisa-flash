// api/webhook.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Essa função será chamada pelo Clerk quando algo mudar na assinatura
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Verifica se é uma requisição POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. Pega os dados enviados pelo Clerk
    const event = req.body;
    console.log('📨 Evento recebido:', event.type);

    // 3. Extrai o ID do usuário e o status da assinatura
    const userId = event.data?.user_id;
    const subscriptionStatus = event.data?.status; // 'active', 'trialing', 'past_due', etc.

    if (!userId || !subscriptionStatus) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    // 4. ATUALIZA OS METADADOS DO USUÁRIO NO CLERK
    // Você precisa da chave secreta do Clerk (SK) para isso
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    
    const response = await fetch(`https://api.clerk.com/v1/users/${userId}/metadata`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        public_metadata: {
          subscription: {
            status: subscriptionStatus,
            updated_at: new Date().toISOString(),
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error('Erro ao atualizar metadados');
    }

    console.log('✅ Metadados atualizados para o usuário', userId);
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Erro:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
}