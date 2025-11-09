import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {Route, Routes, useLocation} from 'react-router-dom';
import {ConfigContext} from './context/ConfigContext';
import {ToastContext, type ToastType} from './context/ToastContext';
import {UserProvider, useUser} from './context/UserContext';
import {IconsProvider} from './context/IconsContext';
import {AuthProvider} from './auth';
import {useWindowIdentity} from './app/hooks/useWindowIdentity';
import {useConfigController} from './app/hooks/useConfigController';
import {useNavigationSync} from './app/hooks/useNavigationSync';
import {useToastBridge} from './app/hooks/useToastBridge';
import {useWindowChrome} from './app/hooks/useWindowChrome';
import {Slide, ToastContainer, toast} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './styles/ReactToastify.sass';
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
    const windowIdentity = useWindowIdentity();
    const {config, loading, preloadError, refreshConfig, updateConfig, setConfig} = useConfigController();
    const {user, fetchUser, loading: userLoading} = useUser();
    const userFetchAttempted = useRef(false);
    const location = useLocation();
    const shouldRenderToasts = windowIdentity.allowsToasts;

    const showToast = useCallback(
        (message: string, type: ToastType = 'info', options?: { durationMs?: number }) => {
            if (!shouldRenderToasts) {
                return;
            }
            const toastId = `${type}:${message}`;
            const resolvedDuration = options?.durationMs;
            const autoCloseValue =
                typeof resolvedDuration === 'number'
                    ? resolvedDuration <= 0
                        ? false
                        : resolvedDuration
                    : 4_000;
            toast(message, {
                type,
                toastId,
                position: 'top-right',
                autoClose: autoCloseValue,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                pauseOnFocusLoss: false,
                draggable: false,
                transition: Slide
            });
        },
        [shouldRenderToasts]
    );

    useToastBridge({enabled: shouldRenderToasts, showToast});
    useWindowChrome(windowIdentity);
    useNavigationSync({config, loading, windowIdentity});

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
                {windowIdentity.isMicWindow ? (
                    // Окно с плавающим микрофоном
                    <div className="frcc h-full w-full bg-transparent text-white">{routes}</div>
                ) : windowIdentity.isResultWindow ? (
                    // Окно результатов - с TitleBar но без sidebar
                    <div className="fc disable-tap-select h-full w-full bg-bg-base text-text-primary">{routes}</div>
                ) : windowIdentity.isErrorWindow ? (
                    // Окно ошибки - полноэкранное без sidebar
                    <div className="fc disable-tap-select h-full w-full bg-bg-base text-text-primary">{routes}</div>
                ) : hasBuiltInTitleBar ? (
                    // Окна Welcome, Auth, Setup уже имеют встроенный TitleBar
                    <div className="fc disable-tap-select h-full bg-bg-base text-text-primary">{routes}</div>
                ) : (
                    <div className="fc disable-tap-select h-full bg-bg-base text-text-primary">
                        <TitleBar/>
                        <div className="fr flex-1 overflow-hidden">
                            {needsSidebar && <Sidebar/>}
                            <main className="flex-1 overflow-hidden bg-bg-secondary/50">
                                <div className="h-full overflow-auto">{routes}</div>
                            </main>
                        </div>
                    </div>
                )}
                {shouldRenderToasts ? (
                    <ToastContainer
                        position="top-right"
                        theme="colored"
                        newestOnTop
                        closeOnClick
                        pauseOnFocusLoss={false}
                        pauseOnHover
                        draggable={false}
                        autoClose={false}
                        limit={3}
                    />
                ) : null}
            </ConfigContext.Provider>
        </ToastContext.Provider>
    );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <UserProvider>
                <IconsProvider>
                    <AppContent/>
                </IconsProvider>
            </UserProvider>
        </AuthProvider>
    );
};

export default App;
