import React, {createContext, useCallback, useContext, useMemo} from 'react';
import type {User} from '@shared/types';
import {useAuth} from '../auth';

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
        throw new Error('useUser must be used within UserProvider');
    }
    return context;
};

interface UserProviderProps {
    children: React.ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({children}) => {
    const {
        user,
        isBusy,
        error,
        reloadUser,
        signOut
    } = useAuth();

    const fetchUser = useCallback(async (): Promise<User | null> => {
        try {
            return await reloadUser();
        } catch (err) {
            console.error('[UserContext] Failed to reload user:', err);
            return null;
        }
    }, [reloadUser]);

    const clearUser = useCallback((): void => {
        signOut();
    }, [signOut]);

    const value = useMemo(
        () => ({
            user,
            loading: isBusy,
            error,
            fetchUser,
            clearUser
        }),
        [user, isBusy, error, fetchUser, clearUser]
    );

    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

