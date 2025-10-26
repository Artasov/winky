import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@shared/types';

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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async (): Promise<User | null> => {
    if (!window.winky) {
      setError('Preload script not available');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const userData = await window.winky.user.fetch();
      setUser(userData);
      return userData;
    } catch (err: any) {
      console.error('[UserContext] Failed to fetch user:', err);
      setError(err?.message || 'Failed to fetch user');
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearUser = useCallback(() => {
    setUser(null);
    setError(null);
  }, []);

  // Загружаем кешированного пользователя при монтировании
  useEffect(() => {
    const loadCachedUser = async () => {
      if (!window.winky) {
        return;
      }

      try {
        const cachedUser = await window.winky.user.getCached();
        if (cachedUser) {
          setUser(cachedUser);
        }
      } catch (err) {
        console.error('[UserContext] Failed to load cached user:', err);
      }
    };

    void loadCachedUser();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      fetchUser,
      clearUser
    }),
    [user, loading, error, fetchUser, clearUser]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

