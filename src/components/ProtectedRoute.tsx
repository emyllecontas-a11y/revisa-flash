import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        // Se não tiver usuário ou der erro, manda para o login
        if (error || !user) {
          navigate('/login');
          return;
        }

        // Se chegou aqui, está logado → libera o conteúdo
        setLoading(false);
      } catch (err) {
        // Qualquer erro inesperado também manda para o login
        navigate('/login');
      }
    };
    checkAuth();
  }, [navigate]);

  // Enquanto verifica, mostra uma tela de carregamento
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1020] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8A86A8]">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}