import { useAppUser } from '@/contexts/UserContext'; // <-- ALTERADO
import { Navigate } from 'react-router-dom';
import { AccessExpired } from './AccessExpired';

export function ClerkProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useAppUser(); // <-- ALTERADO

  // 1. Aguarda o carregamento (agora do nosso contexto)
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

  // 3. Verifica o trial nos metadados públicos do usuário (se disponível)
  //    Como o user offline pode não ter publicMetadata, tratamos com fallback
  const trialEndsAt = (user as any)?.publicMetadata?.trialEndsAt as string | undefined;
  const now = new Date();
  const trialDate = trialEndsAt ? new Date(trialEndsAt) : null;

  // Se não houver trialEndsAt, permite acesso (fallback para usuários existentes ou offline)
  // Se houver, verifica se a data ainda é futura
  const hasAccess = !trialDate || trialDate > now;

  // 4. Se não tiver acesso (trial expirado), mostra a tela de "Acesso Expirado"
  if (!hasAccess) {
    return <AccessExpired />;
  }

  // 5. Se tiver acesso, renderiza o conteúdo
  return <>{children}</>;
}