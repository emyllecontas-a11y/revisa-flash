// src/client.tsx
import React, { useEffect, useState, useRef } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { getRouter } from './router';
import { FlashcardProvider } from './contexts/FlashcardContext';
import { StudyProvider } from './contexts/StudyContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { getDb, syncWithSupabase } from './lib/db';
import { supabase } from './lib/supabaseClient';
import { setupQueueListener, processPendingOperations } from '@/services/queueService';
import './styles.css';

const router = getRouter();

function Root() {
  const [ready, setReady] = useState(false);
  const userIdRef = useRef<string | null>(null); // guarda o userId para uso na inscrição

  useEffect(() => {
    const initialize = async () => {
      try {
        console.log('🔄 Inicializando RxDB...');
        let userId: string | null = null;

        try {
          const { data: { user }, error } = await supabase.auth.getUser();
          if (error) throw error;
          if (user) {
            userId = user.id;
            localStorage.setItem('revisaflash_user_id', userId);
            console.log('✅ Usuário autenticado via Supabase:', userId);
          }
        } catch (err) {
          const cachedId = localStorage.getItem('revisaflash_user_id');
          if (cachedId) {
            userId = cachedId;
            console.log('✅ Usuário recuperado do cache local:', userId);
          } else {
            console.warn('⚠️ Nenhum usuário disponível (offline e sem cache).');
          }
        }

        if (userId) {
          userIdRef.current = userId;
          await getDb();
          console.log('✅ Banco local inicializado.');
          setReady(true);

          try {
            await syncWithSupabase(userId);
            console.log('✅ Sincronização RxDB concluída!');
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

    const handleOnline = () => {
      console.log('📶 Conexão restaurada, processando fila de operações pendentes...');
      processPendingOperations().catch(console.error);
    };
    window.addEventListener('online', handleOnline);

    setupQueueListener();

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // ============================================================
  // INSCRIÇÃO EM TEMPO REAL (Supabase Realtime)
  // ============================================================
  useEffect(() => {
    if (!userIdRef.current || !ready) return;

    const userId = userIdRef.current;

    // Cria um canal para escutar todas as tabelas do schema 'public'
    const channel = supabase
      .channel('realtime-sync')
      .on(
        'postgres_changes',
        {
          event: '*', // escuta todos os eventos (INSERT, UPDATE, DELETE)
          schema: 'public',
          // filter: `user_id=eq.${userId}`, // opcional: só escuta dados do usuário logado
        },
        async (payload) => {
          console.log('📡 Mudança detectada no Supabase:', payload);
          try {
            // Re-sincroniza o banco local com o Supabase
            await syncWithSupabase(userId);
            console.log('✅ Re-sincronização concluída após mudança em tempo real.');
          } catch (syncError) {
            console.warn('⚠️ Erro ao re-sincronizar em tempo real:', syncError);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Inscrição em tempo real estabelecida com sucesso.');
        } else {
          console.log(`🔄 Status da inscrição: ${status}`);
        }
      });

    // Limpa a inscrição ao desmontar o componente
    return () => {
      console.log('🔌 Removendo inscrição em tempo real...');
      supabase.removeChannel(channel);
    };
  }, [ready]); // executa quando o app ficar pronto

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
    <LoadingProvider>
      <FlashcardProvider>
        <StudyProvider>
          <RouterProvider router={router} />
        </StudyProvider>
      </FlashcardProvider>
    </LoadingProvider>
  );
}

hydrateRoot(document, <Root />);