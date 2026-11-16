// src/contexts/AulaMateriaisContext.tsx
// Contexto de Material de Apoio (PDFs por aula).
// Padrão: ErrorContext (RxDB offline-first + listener $.subscribe com debounce).
// userId vem do UserContext (Clerk online / localStorage offline), igual ao ErrorContext.

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { getDb } from '@/lib/db';
import { uploadMaterial, removeMaterial as removeMaterialService, getMateriaisByAula, type AulaMaterial } from '@/services/aulaMateriaisService';
import { useAppUser } from '@/contexts/UserContext';

interface AulaMateriaisContextType {
  materiais: AulaMaterial[];
  loading: boolean;
  userId: string | null;
  refresh: () => Promise<void>;
  addMaterial: (aulaId: string, file: File) => Promise<AulaMaterial>;
  removeMaterial: (materialId: string, storagePath: string) => Promise<void>;
  getByAula: (aulaId: string) => AulaMaterial[];
}

const AulaMateriaisContext = createContext<AulaMateriaisContextType | undefined>(undefined);

export const AulaMateriaisProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { userId, isLoaded, isSignedIn } = useAppUser();
  const [materiais, setMateriais] = useState<AulaMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!userId) {
      setMateriais([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const db = await getDb();
      const col = db.collections.aula_materiais;
      if (!col) {
        setLoading(false);
        return;
      }

      const docs = await col.find({
        selector: { user_id: userId },
      }).exec();

      const loaded = docs.map((d: any) => d.toJSON() as AulaMaterial);
      setMateriais(loaded);
    } catch (error) {
      console.error('❌ [AulaMateriaisContext] Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Carrega dados quando userId muda (login/logout/troca de usuário)
  useEffect(() => {
    if (isLoaded) {
      loadData();
    }
  }, [isLoaded, userId, loadData]);

  // Listener RxDB — recarrega quando a coleção muda
  useEffect(() => {
    if (!userId) return;
    let timeoutId: NodeJS.Timeout | null = null;
    let isSubscribed = true;

    const subscribe = async () => {
      try {
        const db = await getDb();
        if (db.collections?.aula_materiais) {
          const subscription = db.collections.aula_materiais.$.subscribe(() => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              if (isSubscribed) {
                console.log('🔄 [AulaMateriaisContext] Mudança detectada, recarregando...');
                loadData();
              }
              timeoutId = null;
            }, 500);
          });
          return () => {
            isSubscribed = false;
            if (timeoutId) clearTimeout(timeoutId);
            subscription.unsubscribe();
          };
        }
      } catch (e) {
        console.warn('Erro ao configurar listener de aula_materiais:', e);
      }
    };

    subscribe();
  }, [userId, loadData]);

  const addMaterial = useCallback(
    async (aulaId: string, file: File): Promise<AulaMaterial> => {
      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      const material = await uploadMaterial(aulaId, file, userId);

      // Atualiza estado local otimista
      setMateriais((prev) => [...prev, material]);

      return material;
    },
    [userId]
  );

  const removeMaterial = useCallback(
    async (materialId: string, storagePath: string): Promise<void> => {
      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      await removeMaterialService(materialId, storagePath, userId);

      // Atualiza estado local
      setMateriais((prev) => prev.filter((m) => m.id !== materialId));
    },
    [userId]
  );

  const getByAula = useCallback(
    (aulaId: string): AulaMaterial[] => {
      return materiais.filter((m) => m.aula_id === aulaId);
    },
    [materiais]
  );

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const value = useMemo(
    () => ({
      materiais,
      loading,
      userId,
      refresh,
      addMaterial,
      removeMaterial,
      getByAula,
    }),
    [materiais, loading, userId, refresh, addMaterial, removeMaterial, getByAula]
  );

  return (
    <AulaMateriaisContext.Provider value={value}>
      {children}
    </AulaMateriaisContext.Provider>
  );
};

export const useAulaMateriais = () => {
  const context = useContext(AulaMateriaisContext);
  if (!context) {
    throw new Error('useAulaMateriais deve ser usado dentro de AulaMateriaisProvider');
  }
  return context;
};