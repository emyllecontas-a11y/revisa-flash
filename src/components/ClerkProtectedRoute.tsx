import { SignedIn, SignedOut, useUser } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';

export function ClerkProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();

  // 1. Aguarda o carregamento do Clerk
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-foreground/55">Verificando acesso...</p>
      </div>
    );
  }

  // 2. Se não estiver logado, redireciona para login
  if (!isSignedIn) {
    return <Navigate to="/login" replace />;
  }

  // 3. Verifica a assinatura nos metadados públicos do usuário
  const subscription = user?.publicMetadata?.subscription as
    | { status: string }
    | undefined;
  const status = subscription?.status;

  // Acesso permitido se status for 'active' ou 'trialing'
  const hasAccess = status === 'active' || status === 'trialing';

  // 4. Se não tiver acesso (não assinou ou expirou), redireciona para a landing page (seção de planos)
  if (!hasAccess) {
    return <Navigate to="/landing#planos" replace />;
  }

  // 5. Se tiver acesso, renderiza o conteúdo
  return <>{children}</>;
}