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
import {configBridge} from './services/winkyBridge';
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
import HistoryPage from './windows/HistoryPage';
import NotesPage from './windows/NotesPage';
import InfoPage from './windows/InfoPage';
import ResultWindowPage from './windows/ResultWindowPage';
import ErrorWindow from './windows/ErrorWindow';
import DesktopShell from './app/layouts/DesktopShell';
import MicShell from './app/layouts/MicShell';
import ResultShell from './app/layouts/ResultShell';
import ErrorShell from './app/layouts/ErrorShell';
import StandaloneWindow from './app/layouts/StandaloneWindow';
import {SPEECH_MODES} from '@shared/constants';
import TitleBar from './components/TitleBar';
import {checkLocalModelDownloaded, warmupLocalSpeechModel} from './services/localSpeechModels';
import StyleUsageSentinel from './components/StyleUsageSentinel';

const LOCAL_SERVER_READY_TIMEOUT_MS = 2 * 60 * 1000;
const LOCAL_SERVER_POLL_INTERVAL_MS = 2_000;

const AppContent: React.FC = () => {
    const windowIdentity = useWindowIdentity();
    const {config, loading, preloadError, refreshConfig, updateConfig, setConfig} = useConfigController();
    const {user, fetchUser, loading: userLoading} = useUser();
    const userFetchAttempted = useRef(false);
    const actionsFetched = useRef(false);
    const shouldRenderToasts = windowIdentity.allowsToasts;
    const isAuthenticated = Boolean(user);
    const navigate = useNavigate();
    const warmupRequestedModelRef = useRef<string | null>(null);

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
        const shouldWarmup =
            Boolean(config?.launchOnSystemStartup) &&
            Boolean(config?.autoStartLocalSpeechServer) &&
            config?.speech.mode === SPEECH_MODES.LOCAL;

        if (!shouldWarmup) {
            warmupRequestedModelRef.current = null;
            return;
        }

        const model = config?.speech.model?.trim();
        if (!model) {
            return;
        }

        if (warmupRequestedModelRef.current === model) {
            return;
        }

        let cancelled = false;

        // Ждём, пока локальный сервер действительно поднимется, иначе HTTP-проверка модели всегда вернёт false.
        const waitForLocalServerReady = async (): Promise<boolean> => {
            if (typeof window === 'undefined') {
                return true;
            }
            const localSpeechApi = window.winky?.localSpeech;
            if (!localSpeechApi?.checkHealth && !localSpeechApi?.getStatus) {
                return true;
            }

            const fetchStatus = async () => {
                try {
                    if (localSpeechApi.checkHealth) {
                        return await localSpeechApi.checkHealth();
                    }
                    return await localSpeechApi.getStatus();
                } catch (error) {
                    console.warn('[App] Не удалось получить статус локального сервера, повторяем…', error);
                    return null;
                }
            };

            const startedAt = Date.now();
            while (!cancelled) {
                const status = await fetchStatus();
                if (cancelled) {
                    return false;
                }
                if (status?.running) {
                    return true;
                }
                if (status && !status.installed && status.phase === 'not-installed') {
                    console.warn('[App] Локальный сервер не установлен, пропускаем автопрогрев.');
                    return false;
                }
                if (Date.now() - startedAt >= LOCAL_SERVER_READY_TIMEOUT_MS) {
                    console.warn(
                        '[App] Локальный сервер не запустился за отведённое время, прекращаем ожидание.'
                    );
                    return false;
                }
                await new Promise((resolve) => setTimeout(resolve, LOCAL_SERVER_POLL_INTERVAL_MS));
            }
            return false;
        };

        const run = async () => {
            const serverReady = await waitForLocalServerReady();
            if (!serverReady || cancelled) {
                return;
            }

            const downloaded = await checkLocalModelDownloaded(model, {force: true});
            if (!downloaded || cancelled) {
                if (!downloaded) {
                    console.warn(
                        `[App] Пропускаем автопрогрев: модель ${model} не отмечена как скачанная или сервер недоступен.`
                    );
                }
                return;
            }
            warmupRequestedModelRef.current = model;
            const maxAttempts = 3;
            for (let attempt = 0; attempt < maxAttempts && !cancelled; attempt += 1) {
                try {
                    const result = await warmupLocalSpeechModel(model);
                    // Если модель занята - это нормально, не пробуем снова
                    if (result.device === 'busy' && result.compute_type === 'skipped') {
                        console.log('[App] Модель занята, автопрогрев пропущен.');
                    }
                    return;
                } catch (error: any) {
                    const status = error?.response?.status;
                    // 409 означает модель занята - не ошибка, просто выходим
                    if (status === 409) {
                        console.log('[App] Модель занята (409), пропускаем автопрогрев.');
                        return;
                    }
                    console.error(
                        `[App] Автопрогрев модели не удался (попытка ${attempt + 1}/${maxAttempts}):`,
                        error
                    );
                    if (attempt === maxAttempts - 1) {
                        warmupRequestedModelRef.current = null;
                        break;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
                }
            }
        };
        void run();

        return () => {
            cancelled = true;
        };
    }, [
        config?.autoStartLocalSpeechServer,
        config?.launchOnSystemStartup,
        config?.speech.mode,
        config?.speech.model
    ]);

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
        if (windowIdentity.isAuxWindow) {
            return;
        }
        if (userLoading) {
            return;
        }
        if (user) {
            userFetchAttempted.current = true;
            return;
        }
        if (userFetchAttempted.current) {
            return;
        }
        const hasToken = config?.auth.access || config?.auth.accessToken;
        if (!hasToken || (hasToken.trim() === '')) {
            console.log('[App] No token found, requiring authentication');
            userFetchAttempted.current = true;
            if (!windowIdentity.isAuxWindow) {
                navigate('/', {replace: true});
            }
            return;
        }
        console.log('[App] Token found, fetching user from server...');
        userFetchAttempted.current = true;
        
        // Таймаут для очистки токенов если авторизация не завершена
        const timeoutId = setTimeout(() => {
            if (!user && !userLoading) {
                console.warn('[App] User fetch timeout, clearing tokens');
                void configBridge.reset().then(() => {
                    if (!windowIdentity.isAuxWindow) {
                        navigate('/', {replace: true});
                    }
                });
            }
        }, 10000); // 10 секунд
        
        void fetchUser()
            .then((userData) => {
                clearTimeout(timeoutId);
                if (!userData && !windowIdentity.isAuxWindow) {
                    console.warn('[App] Failed to fetch user, clearing tokens and redirecting to auth');
                    // Очищаем токены если пользователь не найден
                    void configBridge.reset().then(() => {
                        navigate('/', {replace: true});
                    });
                }
            })
            .catch((error) => {
                clearTimeout(timeoutId);
                console.error('[App] Failed to fetch user, clearing tokens', error);
                userFetchAttempted.current = false;
                // Очищаем токены при ошибке
                void configBridge.reset().then(() => {
                    if (!windowIdentity.isAuxWindow) {
                        navigate('/', {replace: true});
                    }
                });
            });
            
        return () => {
            clearTimeout(timeoutId);
        };
    }, [config?.auth.access, config?.auth.accessToken, userLoading, fetchUser, navigate, windowIdentity.isAuxWindow, user]);

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
        if (!hasToken || (hasToken.trim() === '')) {
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
    const micPermissionRequestRef = useRef<Promise<void> | null>(null);

    const ensureMicrophonePermission = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            return;
        }
        if (micPermissionRequestRef.current) {
            return micPermissionRequestRef.current;
        }
        const request = navigator.mediaDevices
            .getUserMedia({audio: true})
            .then((stream) => {
                stream.getTracks().forEach((track) => {
                    try {
                        track.stop();
                    } catch {
                        /* ignore */
                    }
                });
            })
            .catch((error) => {
                console.warn('[App] Microphone permission request failed', error);
                throw error;
            })
            .finally(() => {
                micPermissionRequestRef.current = null;
            });
        micPermissionRequestRef.current = request;
        return request;
    }, []);

    useEffect(() => {
        if (!windowIdentity.isAuxWindow && config?.micShowOnLaunch === false) {
            autoShowMicRef.current = false;
        }
    }, [config?.micShowOnLaunch, windowIdentity.isAuxWindow]);

    useEffect(() => {
        if (
            !windowIdentity.isAuxWindow &&
            config?.setupCompleted &&
            config.micShowOnLaunch === true &&
            isAuthenticated &&
            !autoShowMicRef.current
        ) {
            autoShowMicRef.current = true;
            window.winky?.mic?.show?.('auto');
        }
    }, [config?.setupCompleted, config?.micShowOnLaunch, windowIdentity.isAuxWindow, isAuthenticated]);

    useEffect(() => {
        if (windowIdentity.isAuxWindow) {
            return;
        }
        if (!config?.setupCompleted) {
            return;
        }
        void ensureMicrophonePermission();
    }, [windowIdentity.isAuxWindow, config?.setupCompleted, ensureMicrophonePermission]);

    useEffect(() => {
        if (windowIdentity.isAuxWindow) {
            return;
        }
        const api = window.winky;
        if (!api?.on) {
            return;
        }
        const handler = () => {
            void ensureMicrophonePermission();
        };
        const unsubscribe = api.on('mic:prepare-recording', handler as any);
        return () => {
            unsubscribe?.();
        };
    }, [windowIdentity.isAuxWindow, ensureMicrophonePermission]);

    const configContextValue = useMemo(
        () => ({config, setConfig, refreshConfig, updateConfig}),
        [config, refreshConfig, setConfig, updateConfig]
    );

    const toastContextValue = useMemo(
        () => ({showToast}),
        [showToast]
    );

    // Do not show WelcomeWindow when a token already exists (even if the user is still loading)
    const hasToken = config?.auth.access || config?.auth.accessToken;
    const shouldShowWelcome = !hasToken && !isAuthenticated && !userLoading;

    const renderPrimaryWindowState = (content: React.ReactNode) => {
        const showPrimaryChrome = !windowIdentity.isMicWindow && !windowIdentity.isResultWindow && !windowIdentity.isErrorWindow;
        if (!showPrimaryChrome) {
            return (
                <div className="flex h-full items-center justify-center bg-bg-base text-text-primary">
                    {content}
                </div>
            );
        }
        return (
            <div className="fc h-full bg-bg-base text-text-primary">
                <TitleBar/>
                <div className="flex flex-1 items-center justify-center px-6">
                    {content}
                </div>
            </div>
        );
    };

    const routes = (
        <Routes>
            <Route element={<StandaloneWindow/>}>
                <Route path="/" element={shouldShowWelcome ? <WelcomeWindow/> : <AuthWindow/>}/>
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
                        <Route path="/history" element={<HistoryPage/>}/>
                        <Route path="/notes" element={<NotesPage/>}/>
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

    // If we have a token and user data is loading, show a spinner instead of the Welcome view
    const isLoadingUser = userLoading && hasToken && !isAuthenticated;

    return (
        <ToastContext.Provider value={toastContextValue}>
            <ConfigContext.Provider value={configContextValue}>
                {loading ? (
                    renderPrimaryWindowState(
                        <div className="animate-pulse-soft text-primary">Loading...</div>
                    )
                ) : isLoadingUser ? (
                    renderPrimaryWindowState(
                        <div className="fccc gap-4">
                            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                        </div>
                    )
                ) : preloadError || !window.winky ? (
                    renderPrimaryWindowState(
                        <div className="fccc gap-4 px-6 text-center">
                            <div className="text-2xl font-semibold">Failed to initialize the application</div>
                            <p className="max-w-md text-sm text-text-secondary">
                                {preloadError ?? 'The renderer could not access the preload script.'}
                            </p>
                            <p className="text-xs text-text-tertiary">
                                Restart the app. If the problem persists, verify the `dist/main/preload.js` build.
                            </p>
                        </div>
                    )
                ) : (
                    <>
                        <StyleUsageSentinel/>
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
                    </>
                )}
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
