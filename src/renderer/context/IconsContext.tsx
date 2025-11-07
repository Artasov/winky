import React, {createContext, useCallback, useContext, useMemo, useState} from 'react';
import type {ActionIcon} from '@shared/types';

interface IconsContextType {
    icons: ActionIcon[];
    loading: boolean;
    error: string | null;
    fetchIcons: () => Promise<ActionIcon[]>;
    clearIcons: () => void;
}

const IconsContext = createContext<IconsContextType | undefined>(undefined);

export const useIcons = (): IconsContextType => {
    const context = useContext(IconsContext);
    if (context === undefined) {
        throw new Error('useIcons must be used within IconsProvider');
    }
    return context;
};

interface IconsProviderProps {
    children: React.ReactNode;
}

export const IconsProvider: React.FC<IconsProviderProps> = ({children}) => {
    const [icons, setIcons] = useState<ActionIcon[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchIcons = useCallback(async (): Promise<ActionIcon[]> => {
        // Если иконки уже загружены, возвращаем их
        if (icons.length > 0) {
            console.log('[IconsContext] Returning cached icons:', icons.length);
            return icons;
        }

        // Если уже загружаем, не делаем повторный запрос
        if (loading) {
            console.log('[IconsContext] Already loading, waiting...');
            return icons;
        }

        setLoading(true);
        setError(null);

        const api = window.winky?.icons?.fetch;
        if (!api) {
            const message = 'Icons API unavailable.';
            console.error('[IconsContext] Preload icons API is missing');
            setError(message);
            setLoading(false);
            return [];
        }

        try {
            const fetchedIcons = await api();
            setIcons(fetchedIcons);
            console.log('[IconsContext] Icons fetched:', fetchedIcons.length);
            return fetchedIcons;
        } catch (err: any) {
            console.error('[IconsContext] Failed to fetch icons:', err);
            setError(err?.message || 'Failed to fetch icons');
            return [];
        } finally {
            setLoading(false);
        }
    }, [icons, loading]);

    const clearIcons = useCallback(() => {
        setIcons([]);
        setError(null);
        setLoading(false);
    }, []);

    const value = useMemo(
        () => ({
            icons,
            loading,
            error,
            fetchIcons,
            clearIcons
        }),
        [icons, loading, error, fetchIcons, clearIcons]
    );

    return <IconsContext.Provider value={value}>{children}</IconsContext.Provider>;
};

