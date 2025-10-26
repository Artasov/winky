import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Route, Routes, useLocation, useNavigate} from 'react-router-dom';
import type {AppConfig} from '@shared/types';
import {ConfigContext} from './context/ConfigContext';
import {ToastContext} from './context/ToastContext';
import Toast, {ToastMessage, ToastType} from './components/Toast';
import WelcomeWindow from './windows/WelcomeWindow';
import AuthWindow from './windows/AuthWindow';
import SetupWindow from './windows/SetupWindow';
import MainWindow from './windows/MainWindow';
import MePage from './windows/MePage';
import ActionsPage from './windows/ActionsPage';
import SettingsPage from './windows/SettingsPage';
import InfoPage from './windows/InfoPage';
import ResultWindowPage from './windows/ResultWindowPage';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';

const App: React.FC = () => {
    const [config, setConfigState] = useState<AppConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [preloadError, setPreloadError] = useState<string | null>(() =>
        typeof window !== 'undefined' && window.winky ? null : 'Preload-скрипт не загружен.'
    );
    const windowKind = useMemo<'main' | 'settings' | 'mic' | 'result'>(() => {
        if (typeof window === 'undefined') {
            return 'main';
        }
        const params = new URLSearchParams(window.location.search);
        const value = params.get('window');
        if (value === 'settings' || value === 'mic' || value === 'result') {
            return value as 'settings' | 'mic' | 'result';
        }
        return 'main';
    }, []);
    const navigate = useNavigate();
    const location = useLocation();
    const isAuxWindow = windowKind !== 'main';
    const isMicWindow = windowKind === 'mic';
    const isResultWindow = windowKind === 'result';

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
            // Mic и Result окна не управляют навигацией
            if (isMicWindow || isResultWindow) {
                return;
            }

            // Разрешённые маршруты
            const authRoutes = ['/', '/auth'];
            const setupRoutes = ['/setup'];
            const appRoutes = ['/me', '/actions', '/settings', '/info'];

            // Если пользователь не авторизован
            if (!currentConfig.auth.accessToken) {
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
        [navigate, isMicWindow, isResultWindow]
    );

    useEffect(() => {
        // Mic окно всегда прозрачное
        if (isMicWindow && typeof document !== 'undefined') {
            document.body.classList.add('body-transparent');
        } else if (typeof document !== 'undefined') {
            document.body.classList.remove('body-transparent');
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

    useEffect(() => {
        const load = async () => {
            try {
                await refreshConfig();
            } catch (error) {
                console.error('[App] Не удалось загрузить конфигурацию', error);
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, [refreshConfig]);

    useEffect(() => {
        if (config && !loading) {
            handleNavigation(config, location.pathname);
        }
    }, [config, handleNavigation, loading, location.pathname]);

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
            <Route path="/me" element={<MePage/>}/>
            <Route path="/actions" element={<ActionsPage/>}/>
            <Route path="/settings" element={<SettingsPage/>}/>
            <Route path="/info" element={<InfoPage/>}/>
            <Route path="/result" element={<ResultWindowPage/>}/>
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
    const needsSidebar = config?.auth.accessToken && config?.setupCompleted &&
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
                ) : hasBuiltInTitleBar ? (
                    // Окна Welcome, Auth, Setup уже имеют встроенный TitleBar
                    <div className="fc disable-tap-select h-full bg-bg-base text-text-primary">{routes}</div>
                ) : (
                    <div className="fc disable-tap-select h-full bg-bg-base text-text-primary">
                        <TitleBar
                            showWinkyButton={!needsSidebar}
                            onWinkyClick={!needsSidebar ? () => navigate('/actions') : undefined}
                        />
                        <div className="fr flex-1 overflow-hidden">
                            {needsSidebar && <Sidebar/>}
                            <main className="flex-1 overflow-hidden bg-bg-secondary/50">
                                <div className="h-full overflow-auto">{routes}</div>
                            </main>
                        </div>
                    </div>
                )}
                {!isMicWindow && !isResultWindow && <Toast toasts={toasts} placement="top-right"/>}
            </ConfigContext.Provider>
        </ToastContext.Provider>
    );
};

export default App;
