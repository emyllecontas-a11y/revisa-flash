// src/client.tsx
import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { ptBR } from '@clerk/localizations';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { FlashcardProvider, useFlashcardContext } from './contexts/FlashcardContext';
import { StudyProvider } from './contexts/StudyContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { ErrorProvider } from './contexts/ErrorContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { UserProvider, useAppUser } from './contexts/UserContext';
import { getDb, syncWithSupabase } from './lib/db';
import { supabase } from './lib/supabaseClient';
import { processPendingOperations } from '@/services/queueService';
import { LogoIcon } from '@/components/LogoIcon';
import './styles.css';
import { addRxPlugin } from 'rxdb';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';

addRxPlugin(RxDBMigrationPlugin);
addRxPlugin(RxDBUpdatePlugin);

// 🔥 VARIÁVEL INJETADA PELO VITE (timestamp do build)
declare const __BUILD_TIMESTAMP__: string;

// 🔥 VERSÃO DO SCHEMA – INCREMENTE SEMPRE QUE MUDAR A ESTRUTURA DO BANCO
const SCHEMA_VERSION = '3';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error('❌ Missing Clerk Publishable Key. Add VITE_CLERK_PUBLISHABLE_KEY to your .env file.');
}

// ============================================================
// 📦 COMPONENTE ROOT
// ============================================================
function Root() {
  const { userId, isLoaded, isSignedIn, user } = useAppUser();
  const [ready, setReady] = useState(false);
  const userIdRef = useRef<string | null>(userId);
  
  // 🔥 Obtém a função refreshUserSettings do contexto
  const { refreshUserSettings } = useFlashcardContext();

  // 🔥 Sincroniza perfil com Supabase
  useEffect(() => {
    if (!userId || !isLoaded || !isSignedIn) return;
    const syncProfile = async () => {
      try {
        const { data: existing, error: fetchError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!existing) {
          const name = user?.fullName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'Usuário';
          const email = user?.emailAddresses?.[0]?.emailAddress || null;
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              name: name,
              email: email,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          if (insertError) throw insertError;
          console.log('✅ Perfil criado no Supabase para Clerk user:', userId);
        }
      } catch (error) {
        console.error('❌ Erro ao sincronizar perfil com Supabase:', error);
      }
    };
    syncProfile();
  }, [userId, user, isLoaded, isSignedIn]);

  // 🔥 INICIALIZAÇÃO DO RXDB COM VERIFICAÇÃO DE VERSÃO
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      console.log('⏳ Usuário não autenticado – modo visitante ou login pendente.');
      setReady(true);
      return;
    }

    const initialize = async () => {
      try {
        console.log('🔄 Inicializando RxDB para usuário:', userId);
        userIdRef.current = userId;
        localStorage.setItem('revisaflash_user_id', userId);

        // 🔥 VERIFICA VERSÃO DO SCHEMA
        const storedVersion = localStorage.getItem('revisaflash_schema_version');
        if (storedVersion !== SCHEMA_VERSION) {
          console.log(`🔄 Versão do schema mudou (${storedVersion} → ${SCHEMA_VERSION}). Resetando banco local...`);
          try {
            const db = await getDb();
            await db.destroy();
            console.log('✅ Banco local destruído.');
          } catch (destroyError) {
            console.warn('⚠️ Erro ao destruir banco (pode já estar fechado):', destroyError);
          }
          localStorage.removeItem('revisaflash_schema_version');
          await getDb();
          localStorage.setItem('revisaflash_schema_version', SCHEMA_VERSION);
          console.log('✅ Banco recriado com nova versão do schema.');
        } else {
          await getDb();
        }

        console.log('✅ Banco local inicializado.');
        setReady(true);

        try {
          // 🔥 Sincroniza e recarrega configurações
          await syncWithSupabase(userId, () => {
            refreshUserSettings();
          });
          console.log('✅ Sincronização RxDB concluída!');
          await processPendingOperations();
          console.log('✅ Fila de operações processada.');
          // Recarrega configurações novamente após processar fila
          await refreshUserSettings();
        } catch (syncError) {
          console.warn('⚠️ Sincronização falhou (offline ou erro):', syncError);
        }
      } catch (error) {
        console.error('❌ Erro ao inicializar RxDB:', error);
        setReady(true);
      }
    };
    initialize();
  }, [isLoaded, isSignedIn, userId, refreshUserSettings]);

  // 🔥 LISTENER ONLINE E SETUP DO LISTENER DA FILA (COM IMPORT DINÂMICO)
  useEffect(() => {
    const handleOnline = () => {
      console.log('📶 Conexão restaurada, processando fila de operações pendentes...');
      if (userIdRef.current) {
        processPendingOperations().catch(console.error);
        syncWithSupabase(userIdRef.current, () => {
          refreshUserSettings();
        }).catch(console.warn);
      }
    };
    window.addEventListener('online', handleOnline);

    // 🔥 Importação dinâmica para evitar dependência circular
    import('@/services/queueService').then(({ setupQueueListener }) => {
      setupQueueListener();
    }).catch(err => {
      console.warn('⚠️ Falha ao carregar setupQueueListener:', err);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshUserSettings]);

  // 🔥 REALTIME SUBSCRIPTION (com debounce)
  useEffect(() => {
    if (!userIdRef.current || !ready) return;
    const userId = userIdRef.current;

    let syncTimeout: NodeJS.Timeout | null = null;

    const channel = supabase
      .channel('realtime-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
        },
        async (payload) => {
          console.log('📡 Mudança detectada no Supabase:', payload);
          if (syncTimeout) {
            clearTimeout(syncTimeout);
            syncTimeout = null;
          }
          syncTimeout = setTimeout(async () => {
            try {
              await syncWithSupabase(userId, () => {
                refreshUserSettings();
              });
              console.log('✅ Re-sincronização concluída após mudança em tempo real.');
            } catch (syncError) {
              console.warn('⚠️ Erro ao re-sincronizar em tempo real:', syncError);
            } finally {
              syncTimeout = null;
            }
          }, 2000);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Inscrição em tempo real estabelecida com sucesso.');
        } else {
          console.log(`🔄 Status da inscrição: ${status}`);
        }
      });

    return () => {
      console.log('🔌 Removendo inscrição em tempo real...');
      if (syncTimeout) {
        clearTimeout(syncTimeout);
        syncTimeout = null;
      }
      supabase.removeChannel(channel);
    };
  }, [ready, refreshUserSettings]);

  // 🔥 LISTENER DE VISIBILIDADE DA ABA (sincroniza quando a aba ganha foco)
  useEffect(() => {
    if (!userIdRef.current || !ready) return;
    const userId = userIdRef.current;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ Aba focada, sincronizando dados...');
        syncWithSupabase(userId, () => {
          refreshUserSettings();
        })
          .then(() => console.log('✅ Sincronização por foco concluída'))
          .catch(err => console.warn('⚠️ Falha ao sincronizar por foco:', err));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [ready, refreshUserSettings]);

  // 🔥 SINCRONIZAÇÃO PERIÓDICA (a cada 5 minutos)
  useEffect(() => {
    if (!userIdRef.current || !ready) return;
    const userId = userIdRef.current;

    const intervalId = setInterval(() => {
      console.log('⏰ Sincronização periódica (5min)...');
      syncWithSupabase(userId, () => {
        refreshUserSettings();
      }).catch(err => console.warn('⚠️ Falha na sincronização periódica:', err));
    }, 5 * 60 * 1000); // 5 minutos

    return () => clearInterval(intervalId);
  }, [ready, refreshUserSettings]);

  // 🚀 TELA DE CARREGAMENTO
  if (!isLoaded || !ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <LogoIcon size={56} className="animate-pulse" />
          <p className="text-sm text-foreground/55">
            {!isLoaded ? 'Autenticando...' : 'Carregando dados...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <LoadingProvider>
        <FlashcardProvider>
          <StudyProvider>
            <ErrorProvider>
              <RouterProvider router={router} />
            </ErrorProvider>
          </StudyProvider>
        </FlashcardProvider>
      </LoadingProvider>
    </ThemeProvider>
  );
}

// ============================================================
// 🌐 COMPONENTE PRINCIPAL – ENVOLVE COM CLERK E UserProvider
// ============================================================
function AppWithAuth() {
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      localization={ptBR}
      signInUrl="/login"
      signUpUrl="/cadastro"
      fallbackRedirectUrl="/"
      __experimental_billing={{ enabled: true }}
      appearance={{
        // Mantenha a aparência que você já tinha
      }}
    >
      <UserProvider>
        <Root />
      </UserProvider>
    </ClerkProvider>
  );
}

// ============================================================
// 🔥 REGISTRO DO SERVICE WORKER (CORRIGIDO)
// ============================================================
if ('serviceWorker' in navigator) {
  const registerSW = async () => {
    try {
      const swUrl = `/sw.js?v=${__BUILD_TIMESTAMP__}`;
      const registration = await navigator.serviceWorker.register(swUrl, { scope: '/' });
      console.log('✅ Service Worker registrado com sucesso:', registration);
      if (registration.active) {
        registration.active.postMessage({ type: 'CLAIM' });
        console.log('✅ Comando CLAIM enviado para o Service Worker.');
      }
      await navigator.serviceWorker.ready;
      console.log('✅ Service Worker está pronto e controlando a página.');
    } catch (error) {
      console.error('❌ Erro ao registrar Service Worker:', error);
    }
  };
  registerSW();
} else {
  console.warn('⚠️ Service Worker não é suportado neste navegador.');
}

// ============================================================
// 🔧 EXPORTA FUNÇÃO DE SINCRONIZAÇÃO MANUAL (opcional)
// ============================================================
export const manualSync = async () => {
  const userId = localStorage.getItem('revisaflash_user_id');
  if (!userId) {
    console.warn('Usuário não logado');
    return;
  }
  try {
    await syncWithSupabase(userId);
    console.log('✅ Sincronização manual concluída!');
    return true;
  } catch (err) {
    console.error('❌ Erro na sincronização manual:', err);
    throw err;
  }
};

const root = createRoot(document.getElementById('root')!);
root.render(<AppWithAuth />);