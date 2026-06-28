import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { getDb, syncWithSupabase } from './lib/db';
import { supabase } from './lib/supabaseClient';

function Root() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        console.log('🔄 Inicializando RxDB...');
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          console.error('Erro ao obter usuário:', error);
          setReady(true);
          return;
        }
        if (user) {
          console.log('✅ Usuário autenticado:', user.id);
          await getDb();
          await syncWithSupabase(user.id);
          console.log('✅ Sincronização RxDB concluída!');
        } else {
          console.log('⚠️ Nenhum usuário autenticado. Modo visitante.');
        }
        setReady(true);
      } catch (error) {
        console.error('❌ Erro ao inicializar RxDB:', error);
        setReady(true);
      }
    };
    initialize();
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0B1020] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8A86A8]">Preparando dados...</p>
        </div>
      </div>
    );
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);