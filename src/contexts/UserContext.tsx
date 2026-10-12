// src/contexts/UserContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useUser as useClerkUser } from '@clerk/clerk-react';

type User = {
  id: string;
  fullName: string | null;
  emailAddresses: { emailAddress: string }[];
  username: string | null;
} | null;

type UserContextType = {
  user: User;
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

// Hook para usar em toda a aplicação
export const useAppUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useAppUser must be used within a UserProvider');
  }
  return context;
};

// Provedor
export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const clerkUser = useClerkUser(); // sempre chama, mas só usamos se online
  const [offlineUser, setOfflineUser] = useState<User>(null);
  const [offlineLoaded, setOfflineLoaded] = useState(false);

  // Monitora online/offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 🔥 Limpeza de identidade local quando o Clerk confirma que não há sessão.
  // Cobre: logout explícito, expiração de sessão, logout em outra aba,
  // remoção de conta, ações administrativas — qualquer caso em que o Clerk
  // diga "ninguém está logado", a chave local é apagada.
  useEffect(() => {
    if (!clerkUser.isLoaded) return;
    if (clerkUser.isSignedIn) return;
    try {
      localStorage.removeItem('revisaflash_user_id');
    } catch { /* ignore */ }
  }, [clerkUser.isLoaded, clerkUser.isSignedIn]);

  // Carrega usuário do localStorage quando offline
  useEffect(() => {
    if (!isOnline) {
      const userId = localStorage.getItem('revisaflash_user_id');
      if (userId) {
        setOfflineUser({
          id: userId,
          fullName: 'Usuário Offline',
          emailAddresses: [{ emailAddress: 'offline@local' }],
          username: 'offline_user',
        });
      } else {
        setOfflineUser(null);
      }
      setOfflineLoaded(true);
    }
  }, [isOnline]);

  // Se estiver online, usa os dados do Clerk
  if (isOnline) {
    const { user, isLoaded, isSignedIn } = clerkUser;
    const userId = user?.id || null;
    // Mapeia o user do Clerk para o formato esperado
    const mappedUser = user ? {
      id: user.id,
      fullName: user.fullName || user.username || user.emailAddresses?.[0]?.emailAddress?.split('@')[0] || null,
      emailAddresses: user.emailAddresses || [],
      username: user.username || null,
    } : null;

    return (
      <UserContext.Provider value={{
        user: mappedUser,
        isLoaded,
        isSignedIn,
        userId,
      }}>
        {children}
      </UserContext.Provider>
    );
  }

  // Offline: usa dados do localStorage
  return (
    <UserContext.Provider value={{
      user: offlineUser,
      isLoaded: offlineLoaded,
      isSignedIn: !!offlineUser,
      userId: offlineUser?.id || null,
    }}>
      {children}
    </UserContext.Provider>
  );
};