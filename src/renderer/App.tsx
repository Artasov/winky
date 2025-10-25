import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import type { AppConfig } from '@shared/types';
import { ConfigContext } from './context/ConfigContext';
import { ToastContext } from './context/ToastContext';
import Toast, { ToastMessage, ToastType } from './components/Toast';
import WelcomeWindow from './windows/WelcomeWindow';
import AuthWindow from './windows/AuthWindow';
import SetupWindow from './windows/SetupWindow';
import MainWindow from './windows/MainWindow';
import SettingsWindow from './windows/SettingsWindow';
import TitleBar from './components/TitleBar';
import classNames from 'classnames';
import { resetInteractivity } from './utils/windowInteractivity';

const App: React.FC = () => {
  const [config, setConfigState] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [preloadError, setPreloadError] = useState<string | null>(() =>
    typeof window !== 'undefined' && window.winky ? null : 'Preload-скрипт не загружен.'
  );
  const [windowKind] = useState<'main' | 'settings'>(() => {
    if (typeof window === 'undefined') {
      return 'main';
    }
    const params = new URLSearchParams(window.location.search);
    return (params.get('window') as 'settings') ?? 'main';
  });
  const navigate = useNavigate();
  const location = useLocation();
  const isMainRoute = location.pathname === '/main';
  const isSettingsRoute = location.pathname === '/settings';
  const isAuxWindow = windowKind !== 'main';

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
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
      if (isAuxWindow) {
        return;
      }

      if (currentPath === '/settings') {
        return;
      }

      if (!currentConfig.auth.accessToken) {
        if (currentPath === '/' || currentPath === '/auth') {
          return;
        }
        navigate('/');
        return;
      }

      if (!currentConfig.setupCompleted) {
        if (currentPath === '/setup') {
          return;
        }
        navigate('/setup');
        return;
      }

      if (currentPath !== '/main') {
        navigate('/main');
      }
    },
    [navigate, isAuxWindow]
  );

  useEffect(() => {
    if (!isAuxWindow && window.winky?.windows?.setMode) {
      window.winky.windows.setMode(isMainRoute ? 'main' : 'default').catch((error) => {
        console.error('[App] Не удалось изменить режим окна', error);
      });
    }

    if (typeof document !== 'undefined') {
      if (isMainRoute) {
        document.body.classList.add('body-transparent');
      } else {
        document.body.classList.remove('body-transparent');
      }
    }
  }, [isAuxWindow, isMainRoute]);

  useEffect(() => {
    if (isAuxWindow || !window.winky?.windowControls?.setInteractive) {
      return;
    }

    resetInteractivity();

    if (isMainRoute) {
      window.winky.windowControls
        .setInteractive(false)
        .catch((error) => console.error('[App] Не удалось включить кликабельность по умолчанию', error));
    } else {
      window.winky.windowControls
        .setInteractive(true)
        .catch((error) => console.error('[App] Не удалось отключить click-through режим', error));
    }
  }, [isAuxWindow, isMainRoute]);

  useEffect(() => {
    if (!isAuxWindow || !window.winky?.windowControls?.setInteractive) {
      return;
    }

    resetInteractivity();
    window.winky.windowControls
      .setInteractive(true)
      .catch((error) => console.error('[App] Не удалось активировать режим взаимодействия для дополнительного окна', error));
  }, [isAuxWindow]);

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
    () => ({ config, setConfig, refreshConfig, updateConfig }),
    [config, refreshConfig, setConfig, updateConfig]
  );

  const toastContextValue = useMemo(
    () => ({ showToast }),
    [showToast]
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-200">
        Загрузка...
      </div>
    );
  }

  if (preloadError || !window.winky) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-slate-200">
        <h1 className="text-2xl font-semibold">Не удалось инициализировать приложение</h1>
        <p className="max-w-md text-sm text-slate-400">{preloadError ?? 'Веб-приложение не получило доступ к preload-скрипту.'}</p>
        <p className="text-xs text-slate-500">
          Перезапустите приложение. Если проблема повторяется, проверьте сборку `dist/main/preload.js`.
        </p>
      </div>
    );
  }

  return (
    <ToastContext.Provider value={toastContextValue}>
      <ConfigContext.Provider value={configContextValue}>
        <div
          className={classNames('flex min-h-full flex-col', {
            'bg-slate-950 text-slate-100': !isMainRoute,
            'bg-transparent text-white': isMainRoute
          })}
        >
          {!isMainRoute && <TitleBar showSettingsButton={!isSettingsRoute} />}
          <div className={classNames('flex-1', { 'flex items-stretch justify-center': !isMainRoute })}>
            <Routes>
              <Route path="/" element={<WelcomeWindow />} />
              <Route path="/auth" element={<AuthWindow />} />
              <Route path="/setup" element={<SetupWindow />} />
              <Route path="/main" element={<MainWindow />} />
              <Route path="/settings" element={<SettingsWindow />} />
            </Routes>
          </div>
        </div>
        <Toast toasts={toasts} onDismiss={dismissToast} />
      </ConfigContext.Provider>
    </ToastContext.Provider>
  );
};

export default App;
