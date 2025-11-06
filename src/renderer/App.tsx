import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Route, Routes, useLocation, useNavigate} from 'react-router-dom';
import type {AppConfig} from '@shared/types';
import {ConfigContext} from './context/ConfigContext';
import {ToastContext} from './context/ToastContext';
import {UserProvider, useUser} from './context/UserContext';
import {IconsProvider} from './context/IconsContext';
import {AuthProvider} from './auth';
import Toast, {ToastMessage, ToastType} from './components/Toast';
import WelcomeWindow from './windows/WelcomeWindow';
import AuthWindow from './windows/AuthWindow';
import SetupWindow from './windows/SetupWindow';
import MainWindow from './windows/MainWindow';
import MicWindow from './windows/MicWindow';
import MePage from './windows/MePage';
import ActionsPage from './windows/ActionsPage';
import SettingsPage from './windows/SettingsPage';
import InfoPage from './windows/InfoPage';
import ResultWindowPage from './windows/ResultWindowPage';
import ErrorWindow from './windows/ErrorWindow';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';

const AppContent: React.FC = () => {
    const [config, setConfigState] = useState<AppConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const { user, fetchUser, loading: userLoading } = useUser();
    const [preloadError, setPreloadError] = useState<string | null>(() =>
        typeof window !== 'undefined' && window.winky ? null : 'Preload-скрипт не загружен.'
    );
    const userFetchAttempted = useRef(false);
    const windowKind = useMemo<'main' | 'settings' | 'mic' | 'result' | 'error'>(() => {
        if (typeof window === 'undefined') {
            return 'main';
        }
        const params = new URLSearchParams(window.location.search);
        const value = params.get('window');
        if (value === 'settings' || value === 'mic' || value === 'result' || value === 'error') {
            return value as 'settings' | 'mic' | 'result' | 'error';
        }
        return 'main';
    }, []);
    const navigate = useNavigate();
    const location = useLocation();
    const isAuxWindow = windowKind !== 'main';
    const isMicWindow = windowKind === 'mic';
    const isResultWindow = windowKind === 'result';
    const isErrorWindow = windowKind === 'error';

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
        setToasts((prev) => [...prev, {id, message, type}]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, 4000);
    }, []);

    const refreshConfig = useCallback(async (): Promise<AppConfig> => {
        if (!window.winky) {
            const message = 'Preload-скрипт недоступен.';
            setPreloadError(message);
            throw new Error(message);
        }
        const result = await window.winky.config.get();
        setConfigState(result);
        setPreloadError(null);
        return result;
    }, []);

    const updateConfig = useCallback(async (partial: Partial<AppConfig>): Promise<AppConfig> => {
        if (!window.winky) {
            const message = 'Preload-скрипт недоступен.';
            setPreloadError(message);
            throw new Error(message);
        }
        const result = await window.winky.config.update(partial);
        setConfigState(result);
        setPreloadError(null);
        return result;
    }, []);

    const setConfig = useCallback((next: AppConfig) => {
        setConfigState(next);
    }, []);

    const handleNavigation = useCallback(
        (currentConfig: AppConfig, currentPath: string) => {
            // Mic, Result и Error окна не управляют навигацией
            if (isMicWindow || isResultWindow || isErrorWindow) {
                return;
            }

            // Разрешённые маршруты
            const authRoutes = ['/', '/auth'];
            const setupRoutes = ['/setup'];
            const appRoutes = ['/me', '/actions', '/settings', '/info'];

            // Если пользователь не авторизован
            const hasToken = currentConfig.auth.access || currentConfig.auth.accessToken;
            if (!hasToken) {
                if (authRoutes.includes(currentPath)) {
                    return;
                }
                navigate('/');
                return;
            }

            // Если настройка не завершена
            if (!currentConfig.setupCompleted) {
                if (setupRoutes.includes(currentPath)) {
                    return;
                }
                navigate('/setup');
                return;
            }

            // Пользователь авторизован и настройка завершена
            if (appRoutes.includes(currentPath)) {
                return;
            }

            // По умолчанию переходим на /actions
            navigate('/actions');
        },
        [navigate, isMicWindow, isResultWindow, isErrorWindow]
    );

    useEffect(() => {
        // Mic окно всегда прозрачное
        if (isMicWindow && typeof document !== 'undefined') {
            document.body.classList.add('body-transparent');
            document.documentElement.style.backgroundColor = 'transparent';
            const root = document.getElementById('root');
            if (root) {
                root.style.backgroundColor = 'transparent';
            }
        } else if (typeof document !== 'undefined') {
            document.body.classList.remove('body-transparent');
            document.documentElement.style.backgroundColor = '';
            const root = document.getElementById('root');
            if (root) {
                root.style.backgroundColor = '';
            }
        }
    }, [isMicWindow]);

    useEffect(() => {
        // Result окно без sidebar и titlebar
        if (isResultWindow && typeof document !== 'undefined') {
            document.body.style.background = '#ffffff';
        }
    }, [isResultWindow]);

    useEffect(() => {
        const subscribe = window.winky?.config?.subscribe;
        if (!subscribe) {
            return;
        }
        const unsubscribe = subscribe((nextConfig) => {
            setConfigState(nextConfig);
        });
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, []);

    // Загружаем конфиг при монтировании
    useEffect(() => {
        const load = async () => {
            try {
                await refreshConfig();
            } catch (error) {
                console.error('[App] Failed to load config', error);
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [refreshConfig]);

    // Загружаем пользователя только если его нет в кеше и есть токен
    useEffect(() => {
        // Ждем пока UserContext загрузит кешированного пользователя
        if (userLoading) {
            return;
        }

        // Уже пытались загрузить пользователя - не делаем повторно
        if (userFetchAttempted.current) {
            return;
        }

        const loadUser = async () => {
            const hasToken = config?.auth.access || config?.auth.accessToken;
            if (!hasToken || (typeof hasToken === 'string' && hasToken.trim() === '')) {
                console.log('[App] No token found, skipping user fetch');
                userFetchAttempted.current = true;
                return;
            }

            // Если пользователь уже загружен из кеша - не делаем повторный запрос
            if (user) {
                console.log('[App] User already loaded from cache:', user.email);
                userFetchAttempted.current = true;
                return;
            }

            // Пользователя нет в кеше, загружаем с сервера
            console.log('[App] Token found but no cached user, fetching from server...');
            userFetchAttempted.current = true;
            try {
                const userData = await fetchUser();
                
                if (!userData) {
                    console.warn('[App] Failed to fetch user, token might be invalid');
                }
            } catch (error) {
                console.error('[App] Failed to fetch user', error);
            }
        };

        void loadUser();
    }, [config?.auth.access, config?.auth.accessToken, user, userLoading, fetchUser]);

    useEffect(() => {
        if (config && !loading) {
            handleNavigation(config, location.pathname);
        }
    }, [config, handleNavigation, loading, location.pathname]);

    // Обработка навигации от main process (из трея)
    useEffect(() => {
        if (isMicWindow || isResultWindow || isErrorWindow) {
            return;
        }
        
        const handleNavigateEvent = (_event: any, route: string) => {
            console.log('[App] Navigate event received:', route);
            navigate(route);
        };
        
        const winky = window.winky as any; // TypeScript кеш может не обновиться, используем any
        if (winky?.on) {
            winky.on('navigate-to', handleNavigateEvent);
        }
        
        return () => {
            if (winky?.removeListener) {
                winky.removeListener('navigate-to', handleNavigateEvent);
            }
        };
    }, [navigate, isMicWindow, isResultWindow, isErrorWindow]);

    const configContextValue = useMemo(
        () => ({config, setConfig, refreshConfig, updateConfig}),
        [config, refreshConfig, setConfig, updateConfig]
    );

    const toastContextValue = useMemo(
        () => ({showToast}),
        [showToast]
    );

    const routes = (
        <Routes>
            <Route path="/" element={<WelcomeWindow/>}/>
            <Route path="/auth" element={<AuthWindow/>}/>
            <Route path="/setup" element={<SetupWindow/>}/>
            <Route path="/main" element={<MainWindow/>}/>
            <Route path="/mic" element={<MicWindow/>}/>
            <Route path="/me" element={<MePage/>}/>
            <Route path="/actions" element={<ActionsPage/>}/>
            <Route path="/settings" element={<SettingsPage/>}/>
            <Route path="/info" element={<InfoPage/>}/>
            <Route path="/result" element={<ResultWindowPage/>}/>
            <Route path="/error" element={<ErrorWindow/>}/>
        </Routes>
    );

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center bg-bg-base text-text-primary">
                <div className="animate-pulse-soft text-primary">Загрузка...</div>
            </div>
        );
    }

    if (preloadError || !window.winky) {
        return (
            <div
                className="flex h-full flex-col items-center justify-center gap-4 bg-bg-base px-6 text-center text-text-primary">
                <h1 className="text-2xl font-semibold">Не удалось инициализировать приложение</h1>
                <p className="max-w-md text-sm text-text-secondary">{preloadError ?? 'Веб-приложение не получило доступ к preload-скрипту.'}</p>
                <p className="text-xs text-text-tertiary">
                    Перезапустите приложение. Если проблема повторяется, проверьте сборку `dist/main/preload.js`.
                </p>
            </div>
        );
    }

    // Определяем, нужен ли Sidebar для текущего маршрута
    // Показываем sidebar если есть токен и setup завершен (не требуем загрузку пользователя)
    const hasToken = config?.auth.access || config?.auth.accessToken;
    const needsSidebar = !loading && 
        hasToken && 
        config?.setupCompleted &&
        ['/me', '/actions', '/settings', '/info'].includes(location.pathname);

    // Эти страницы имеют встроенный TitleBar
    const hasBuiltInTitleBar = ['/', '/auth', '/setup'].includes(location.pathname);

    return (
        <ToastContext.Provider value={toastContextValue}>
            <ConfigContext.Provider value={configContextValue}>
                {isMicWindow ? (
                    // Окно с плавающим микрофоном
                    <div className="frcc h-full w-full bg-transparent text-white">{routes}</div>
                ) : isResultWindow ? (
                    // Окно результатов - с TitleBar но без sidebar
                    <div className="fc disable-tap-select h-full w-full bg-bg-base text-text-primary">{routes}</div>
                ) : isErrorWindow ? (
                    // Окно ошибки - полноэкранное без sidebar
                    <div className="fc disable-tap-select h-full w-full bg-bg-base text-text-primary">{routes}</div>
                ) : hasBuiltInTitleBar ? (
                    // Окна Welcome, Auth, Setup уже имеют встроенный TitleBar
                    <div className="fc disable-tap-select h-full bg-bg-base text-text-primary">{routes}</div>
                ) : (
                    <div className="fc disable-tap-select h-full bg-bg-base text-text-primary">
                        <TitleBar />
                        <div className="fr flex-1 overflow-hidden">
                            {needsSidebar && <Sidebar/>}
                            <main className="flex-1 overflow-hidden bg-bg-secondary/50">
                <div className="h-full overflow-auto">{routes}</div>
                            </main>
                        </div>
                    </div>
                )}
                {!isMicWindow && !isResultWindow && !isErrorWindow && <Toast toasts={toasts} placement="top-right"/>}
            </ConfigContext.Provider>
        </ToastContext.Provider>
    );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
        <UserProvider>
            <IconsProvider>
                <AppContent />
            </IconsProvider>
        </UserProvider>
        </AuthProvider>
    );
};

export default App;
