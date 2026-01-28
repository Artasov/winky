import {useEffect} from 'react';
import type {WindowIdentity} from './useWindowIdentity';
import {useThemeMode} from '../../context/ThemeModeContext';

export const useWindowChrome = ({isMicWindow, isResultWindow}: Pick<WindowIdentity, 'isMicWindow' | 'isResultWindow'>): void => {
    const {themeMode} = useThemeMode();
    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }
        if (isMicWindow) {
            document.body.classList.add('body-transparent');
            document.documentElement.style.backgroundColor = 'transparent';
            const root = document.getElementById('root');
            if (root) {
                root.style.backgroundColor = 'transparent';
            }
            return () => {
                document.body.classList.remove('body-transparent');
                document.documentElement.style.backgroundColor = '';
                const cleanupRoot = document.getElementById('root');
                if (cleanupRoot) {
                    cleanupRoot.style.backgroundColor = '';
                }
            };
        }
        document.body.classList.remove('body-transparent');
        document.documentElement.style.backgroundColor = '';
        const root = document.getElementById('root');
        if (root) {
            root.style.backgroundColor = '';
        }
        return undefined;
    }, [isMicWindow]);

    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }
        if (isResultWindow) {
            const previousBackground = document.body.style.background;
            document.body.style.background = themeMode === 'dark' ? '#000000' : '#ffffff';
            return () => {
                document.body.style.background = previousBackground;
            };
        }
        return undefined;
    }, [isResultWindow, themeMode]);
};
