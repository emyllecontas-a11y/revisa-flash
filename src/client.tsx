/// <reference types="vinxi/types/client" />

import React, { useEffect, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start/client';
import { FlashcardProvider } from './contexts/FlashcardContext';
import { StudyProvider } from './contexts/StudyContext';
import { getRouter } from './router';
import { getDb, syncWithSupabase } from './lib/db';
import { supabase } from './lib/supabaseClient';
import { setupQueueListener, processPendingOperations } from '@/services/queueService';
import './styles.css';

const router = getRouter();

function Root() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        console.log('🔄 Inicializando RxDB...');
        let userId: string | null = null;

        // Tenta obter usuário do Supabase
        try {
          const { data: { user }, error } = await supabase.auth.getUser();
          if (error) throw error;
          if (user) {
            userId = user.id;
            localStorage.setItem('revisaflash_user_id', userId);
            console.log('✅ Usuário autenticado via Supabase:', userId);
          }
        } catch (err) {
          // Fallback para cache
          const cachedId = localStorage.getItem('revisaflash_user_id');
          if (cachedId) {
            userId = cachedId;
            console.log('✅ Usuário recuperado do cache local:', userId);
          } else {
            console.warn('⚠️ Nenhum usuário disponível (offline e sem cache).');
          }
        }

        if (userId) {
          // 1. Inicializa o banco
          await getDb();
          console.log('✅ Banco local inicializado.');

          // 2. 🔥 LIBERA A TELA DE LOADING IMEDIATAMENTE
          setReady(true);

          // 3. Sincronização em segundo plano (NÃO BLOQUEIA)
          try {
            await syncWithSupabase(userId);
            console.log('✅ Sincronização RxDB concluída!');

            // 🔥 Após sincronizar, processa fila de operações pendentes
            await processPendingOperations();
            console.log('✅ Fila de operações processada.');
          } catch (syncError) {
            console.warn('⚠️ Sincronização falhou (offline ou erro):', syncError);
          }
        } else {
          console.warn('⚠️ Sem usuário, modo visitante.');
          setReady(true);
        }
      } catch (error) {
        console.error('❌ Erro ao inicializar RxDB:', error);
        setReady(true);
      }
    };

    initialize();

    // Listener para eventos de conexão
    const handleOnline = () => {
      console.log('📶 Conexão restaurada, processando fila de operações pendentes...');
      processPendingOperations().catch(console.error);
    };
    window.addEventListener('online', handleOnline);

    // Configurar listener da fila para sincronizar quando houver alterações
    setupQueueListener();

    return () => {
      window.removeEventListener('online', handleOnline);
    };
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

  return (
    <FlashcardProvider>
      <StudyProvider>
        <StartClient router={router} />
      </StudyProvider>
    </FlashcardProvider>
  );
}

hydrateRoot(document, <Root />);