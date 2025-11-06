import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@shared/types';
import { useAuth } from '../auth';

interface UserContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  fetchUser: () => Promise<User | null>;
  clearUser: () => void;
}

const UserContext = createContext<UserContextType | null>(null);

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser должен использоваться внутри UserProvider');
  }
  return context;
};

interface UserProviderProps {
  children: React.ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const auth = useAuth();
  const [legacyUser, setLegacyUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Используем пользователя из auth context если доступен, иначе legacy
  const user = auth.user ?? legacyUser;

  const fetchUser = useCallback(async (): Promise<User | null> => {
    // Если используем новую систему авторизации, просто перезагружаем из auth
    if (auth.isAuthenticated) {
      try {
        return await auth.reloadUser();
      } catch (err: any) {
        console.error('[UserContext] Failed to reload user from auth:', err);
        return null;
      }
    }

    // Legacy путь для старой системы авторизации
    if (!window.winky) {
      setError('Preload script not available');
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const userData = await window.winky.user.fetch();
      setLegacyUser(userData);
      setError(null);
      return userData;
    } catch (err: any) {
      console.error('[UserContext] Failed to fetch user:', err);
      const errorMessage = err?.message || 'Failed to fetch user';
      setError(errorMessage);
      setLegacyUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [auth]);

  const clearUser = useCallback(() => {
    setLegacyUser(null);
    setError(null);
    setLoading(false);
    // Не вызываем auth.signOut здесь, это должно делаться явно
  }, []);

  // При монтировании загружаем кешированного пользователя (если есть в main process)
  // Только если не используем новую систему авторизации
  useEffect(() => {
    if (auth.isAuthenticated) {
      // Используем пользователя из auth context
      return;
    }

    const loadCachedUser = async () => {
      if (!window.winky) {
        return;
      }

      try {
        const cachedUser = await window.winky.user.getCached();
        if (cachedUser) {
          setLegacyUser(cachedUser);
          console.log('[UserContext] Loaded cached user:', cachedUser.email);
        }
      } catch (err) {
        console.error('[UserContext] Failed to load cached user:', err);
      }
    };

    void loadCachedUser();
  }, [auth.isAuthenticated]);

  const value = useMemo(
    () => ({
      user,
      loading: loading || auth.isBusy,
      error: error || auth.error,
      fetchUser,
      clearUser
    }),
    [user, loading, error, fetchUser, clearUser, auth.isBusy, auth.error]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

