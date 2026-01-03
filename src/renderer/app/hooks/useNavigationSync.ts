import {useCallback, useEffect} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import type {AppConfig} from '@shared/types';
import type {WindowIdentity} from './useWindowIdentity';

interface NavigationSyncParams {
    config: AppConfig | null;
    loading: boolean;
    windowIdentity: WindowIdentity;
    isAuthenticated: boolean;
}

const authRoutes = ['/', '/auth'];
const setupRoutes = ['/setup'];
const appRoutes = ['/me', '/actions', '/settings', '/info'];

export const useNavigationSync = ({config, loading, windowIdentity, isAuthenticated}: NavigationSyncParams): void => {
    const navigate = useNavigate();
    const location = useLocation();

    const guardNavigation = useCallback((currentPath: string) => {
        if (!config || loading) {
            return;
        }
        if (windowIdentity.isMicWindow || windowIdentity.isResultWindow || windowIdentity.isErrorWindow) {
            return;
        }

        const hasToken = config.auth.access || config.auth.accessToken;
        if (!hasToken) {
            if (!authRoutes.includes(currentPath)) {
                // Если на главной странице и нет токенов, показываем Welcome или Auth
                if (currentPath === '/') {
                    // Остаёмся на "/" - там будет показан Welcome или Auth
                    return;
                }
                navigate('/');
            }
            return;
        }

        // Если есть токены но пользователь еще не авторизован, ждем
        if (!isAuthenticated) {
            console.log('[useNavigationSync] Has tokens but not authenticated yet, waiting...');
            return;
        }

        if (!config.setupCompleted) {
            if (!setupRoutes.includes(currentPath)) {
                console.log('[useNavigationSync] Navigating to /setup');
                navigate('/setup');
            }
            return;
        }

        if (!appRoutes.includes(currentPath)) {
            console.log('[useNavigationSync] Navigating to /actions');
            navigate('/actions');
        }
    }, [config, loading, navigate, windowIdentity.isErrorWindow, windowIdentity.isMicWindow, windowIdentity.isResultWindow, isAuthenticated]);

    useEffect(() => {
        guardNavigation(location.pathname);
    }, [guardNavigation, location.pathname]);

    useEffect(() => {
        if (windowIdentity.isMicWindow || windowIdentity.isResultWindow || windowIdentity.isErrorWindow) {
            return;
        }
        const winky = window.winky as any;
        if (!winky?.on) {
            return;
        }
        const handleNavigateEvent = (route?: string) => {
            if (typeof route !== 'string' || route.length === 0) {
                return;
            }
            navigate(route);
        };
        winky.on('navigate-to', handleNavigateEvent);
        return () => {
            winky.removeListener?.('navigate-to', handleNavigateEvent);
        };
    }, [navigate, windowIdentity.isErrorWindow, windowIdentity.isMicWindow, windowIdentity.isResultWindow]);
};
