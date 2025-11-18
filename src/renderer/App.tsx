import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {Route, Routes, useNavigate} from 'react-router-dom';
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
import DesktopShell from './app/layouts/DesktopShell';
import MicShell from './app/layouts/MicShell';
import ResultShell from './app/layouts/ResultShell';
import ErrorShell from './app/layouts/ErrorShell';
import StandaloneWindow from './app/layouts/StandaloneWindow';

const AppContent: React.FC = () => {
    const windowIdentity = useWindowIdentity();
    const {config, loading, preloadError, refreshConfig, updateConfig, setConfig} = useConfigController();
    const {user, fetchUser, loading: userLoading} = useUser();
    const userFetchAttempted = useRef(false);
    const actionsFetched = useRef(false);
    const shouldRenderToasts = windowIdentity.allowsToasts;
    const isAuthenticated = Boolean(user);
    const navigate = useNavigate();

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
    useNavigationSync({config, loading, windowIdentity, isAuthenticated});

    useEffect(() => {
        const hasToken = config?.auth.access || config?.auth.accessToken;
        if (!hasToken) {
            console.log('[App] Config updated: no tokens found, resetting userFetchAttempted');
            userFetchAttempted.current = false;
        } else {
            console.log('[App] Config updated: tokens found', {
                hasAccess: !!config?.auth.access,
                hasAccessToken: !!config?.auth.accessToken
            });
        }
    }, [config?.auth.access, config?.auth.accessToken]);

    useEffect(() => {
        if (userLoading) {
            return;
        }
        if (userFetchAttempted.current) {
            return;
        }
        const hasToken = config?.auth.access || config?.auth.accessToken;
        if (!hasToken || (typeof hasToken === 'string' && hasToken.trim() === '')) {
            console.log('[App] No token found, requiring authentication');
            userFetchAttempted.current = true;
            if (!windowIdentity.isAuxWindow) {
                navigate('/auth', {replace: true});
            }
            return;
        }
        console.log('[App] Token found, fetching user from server...');
        userFetchAttempted.current = true;
        void fetchUser()
            .then((userData) => {
                if (!userData && !windowIdentity.isAuxWindow) {
                    console.warn('[App] Failed to fetch user, redirecting to auth');
                    navigate('/auth', {replace: true});
                }
            })
            .catch((error) => {
                console.error('[App] Failed to fetch user', error);
                userFetchAttempted.current = false;
                if (!windowIdentity.isAuxWindow) {
                    navigate('/auth', {replace: true});
                }
            });
    }, [config?.auth.access, config?.auth.accessToken, userLoading, fetchUser, navigate, windowIdentity.isAuxWindow]);

    useEffect(() => {
        if (windowIdentity.isAuxWindow) {
            return;
        }
        // Не перенаправляем на /auth, если есть токены в конфигурации (возможно идет процесс OAuth)
        const hasToken = config?.auth.access || config?.auth.accessToken;
        if (userFetchAttempted.current && !isAuthenticated && !userLoading && !hasToken) {
            navigate('/auth', {replace: true});
        }
    }, [isAuthenticated, userLoading, windowIdentity.isAuxWindow, navigate, config?.auth.access, config?.auth.accessToken]);

    useEffect(() => {
        if (windowIdentity.isAuxWindow) {
            return;
        }
        // НЕ запрашиваем actions пока пользователь не авторизован
        if (!isAuthenticated) {
            actionsFetched.current = false;
            return;
        }
        const hasToken = config?.auth.access || config?.auth.accessToken;
        if (!hasToken || (typeof hasToken === 'string' && hasToken.trim() === '')) {
            actionsFetched.current = false;
            return;
        }
        if (actionsFetched.current) {
            return;
        }
        console.log('[App] Fetching actions...');
        actionsFetched.current = true;
        window.winky?.actions?.fetch?.().catch((error) => {
            console.error('[App] Failed to fetch actions', error);
            actionsFetched.current = false;
        });
    }, [config?.auth.access, config?.auth.accessToken, windowIdentity.isAuxWindow, isAuthenticated]);

    const autoShowMicRef = useRef(false);

    useEffect(() => {
        if (!windowIdentity.isAuxWindow && config?.micShowOnLaunch === false) {
            autoShowMicRef.current = false;
        }
    }, [config?.micShowOnLaunch, windowIdentity.isAuxWindow]);

    useEffect(() => {
        if (
            !windowIdentity.isAuxWindow &&
            config?.setupCompleted &&
            config.micShowOnLaunch !== false &&
            !autoShowMicRef.current
        ) {
            autoShowMicRef.current = true;
            window.winky?.mic?.show?.('auto');
        }
    }, [config?.setupCompleted, config?.micShowOnLaunch, windowIdentity.isAuxWindow]);

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
            <Route element={<StandaloneWindow/>}>
                <Route path="/" element={<WelcomeWindow/>}/>
                <Route path="/auth" element={<AuthWindow/>}/>
                <Route path="/setup" element={<SetupWindow/>}/>
            </Route>

            {isAuthenticated ? (
                <>
                    <Route element={<DesktopShell/>}>
                        <Route path="/main" element={<MainWindow/>}/>
                    </Route>

                    <Route element={<DesktopShell allowSidebar/>}>
                        <Route path="/me" element={<MePage/>}/>
                        <Route path="/actions" element={<ActionsPage/>}/>
                        <Route path="/settings" element={<SettingsPage/>}/>
                        <Route path="/info" element={<InfoPage/>}/>
                    </Route>
                </>
            ) : null}

            <Route element={<MicShell/>}>
                <Route path="/mic" element={<MicWindow/>}/>
            </Route>

            <Route element={<ResultShell/>}>
                <Route path="/result" element={<ResultWindowPage/>}/>
            </Route>

            <Route element={<ErrorShell/>}>
                <Route path="/error" element={<ErrorWindow/>}/>
            </Route>
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

    return (
        <ToastContext.Provider value={toastContextValue}>
            <ConfigContext.Provider value={configContextValue}>
                {routes}
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
