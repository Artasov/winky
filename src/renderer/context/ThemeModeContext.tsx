import {createContext, useContext} from 'react';

export type ThemeMode = 'light' | 'dark';

export interface ThemeModeContextValue {
    themeMode: ThemeMode;
    isDark: boolean;
    setThemeMode: (mode: ThemeMode) => void;
    toggleThemeMode: () => void;
}

export const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined);

export const useThemeMode = (): ThemeModeContextValue => {
    const context = useContext(ThemeModeContext);
    if (!context) {
        throw new Error('useThemeMode must be used within ThemeModeProvider');
    }
    return context;
};

