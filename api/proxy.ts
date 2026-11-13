// api/proxy.ts
export default async function handler(req: any, res: any) {
  // Pega o caminho que a Vercel enviou na URL (ex: v1/client?foo=bar)
  const path = req.query.path || '';
  
  // Monta a URL real do Clerk
  const targetUrl = `https://frontend-api.clerk.dev/${path}`;

  // Prepara os cabeçalhos, removendo o host antigo para não dar conflito
  const headers = { ...req.headers };
  delete headers.host;

  // Adiciona as chaves que o Clerk exige para aceitar o proxy
  headers['Clerk-Proxy-Url'] = 'https://una-vox.vercel.app/__clerk';
  headers['Clerk-Secret-Key'] = process.env.CLERK_SECRET_KEY;
  headers['X-Forwarded-For'] = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  try {
    // Faz a requisição para o servidor do Clerk
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    });

    // Devolve a resposta do Clerk para o seu app
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    const data = await response.text();
    res.send(data);
  } catch (error) {
    console.error('Erro no proxy do Clerk:', error);
    res.status(500).json({ error: 'Falha na comunicação com o Clerk' });
  }
}