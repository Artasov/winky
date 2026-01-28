import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {CssBaseline, ThemeProvider} from '@mui/material';
import {createMuiTheme} from './muiTheme';
import {ThemeModeContext, type ThemeMode} from '../context/ThemeModeContext';

type Props = {
    children: React.ReactNode;
};

const THEME_STORAGE_KEY = 'winky_theme_mode';

const readStoredThemeMode = (): ThemeMode => {
    if (typeof window === 'undefined') {
        return 'light';
    }
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
};

const WinkyThemeProvider: React.FC<Props> = ({children}) => {
    const [themeMode, setThemeModeState] = useState<ThemeMode>(() => readStoredThemeMode());

    const setThemeMode = useCallback((mode: ThemeMode) => {
        setThemeModeState(mode);
    }, []);

    const toggleThemeMode = useCallback(() => {
        setThemeModeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
        const root = window.document.documentElement;
        root.dataset.theme = themeMode;
        root.style.colorScheme = themeMode;
    }, [themeMode]);

    const muiTheme = useMemo(() => createMuiTheme(themeMode), [themeMode]);

    const contextValue = useMemo(
        () => ({
            themeMode,
            isDark: themeMode === 'dark',
            setThemeMode,
            toggleThemeMode
        }),
        [themeMode, setThemeMode, toggleThemeMode]
    );

    return (
        <ThemeModeContext.Provider value={contextValue}>
            <ThemeProvider theme={muiTheme}>
                <CssBaseline/>
                {children}
            </ThemeProvider>
        </ThemeModeContext.Provider>
    );
};

export default WinkyThemeProvider;
