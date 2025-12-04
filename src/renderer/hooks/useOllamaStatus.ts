import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    normalizeOllamaModelName,
    subscribeToOllamaDownloads,
    subscribeToOllamaWarmup
} from '../services/ollama';
import {ollamaBridge} from '../services/winkyBridge';

type UseOllamaStatusOptions = {
    enabled: boolean;
    model?: string | null;
    installCheckAttempts?: number;
    installCheckIntervalMs?: number;
};

type UseOllamaStatusResult = {
    installed: boolean | null;
    checking: boolean;
    error: string | null;
    models: string[];
    modelsLoaded: boolean;
    modelChecking: boolean;
    modelDownloaded: boolean | null;
    setModelDownloaded: (value: boolean | null) => void;
    modelDownloading: boolean;
    setModelDownloading: (value: boolean) => void;
    modelWarming: boolean;
    modelError: string | null;
    setModelError: (value: string | null) => void;
    setError: (value: string | null) => void;
    refreshModels: (force?: boolean, maxAttempts?: number, attemptInterval?: number) => Promise<string[]>;
    recheckInstall: () => void;
};

const DEFAULT_INSTALL_ATTEMPTS = 2;
const DEFAULT_INSTALL_INTERVAL_MS = 3000;

export const useOllamaStatus = ({
    enabled,
    model,
    installCheckAttempts = DEFAULT_INSTALL_ATTEMPTS,
    installCheckIntervalMs = DEFAULT_INSTALL_INTERVAL_MS
}: UseOllamaStatusOptions): UseOllamaStatusResult => {
    const [installed, setInstalled] = useState<boolean | null>(null);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [models, setModels] = useState<string[]>([]);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [modelChecking, setModelChecking] = useState(false);
    const [modelDownloaded, setModelDownloaded] = useState<boolean | null>(null);
    const [modelDownloading, setModelDownloading] = useState(false);
    const [modelWarming, setModelWarming] = useState(false);
    const [modelError, setModelError] = useState<string | null>(null);
    const mountedRef = useRef(true);
    const [installProbe, setInstallProbe] = useState(0);
    const normalizedModel = useMemo(() => normalizeOllamaModelName(model ?? ''), [model]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const refreshModels = useCallback(
        async (force: boolean = false, maxAttempts: number = 3, attemptInterval: number = 2000): Promise<string[]> => {
            if (!enabled || !installed) {
                setModels([]);
                setModelsLoaded(false);
                return [];
            }
            setModelChecking(true);
            setModelsLoaded(false);

            let lastError: any = null;
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                try {
                    // First check if server is running (fast HTTP check, no CLI)
                    const serverRunning = await ollamaBridge.isServerRunning();
                    if (!serverRunning) {
                        throw new Error('Ollama server is not running. Please start Ollama first.');
                    }
                    
                    const modelsList = await Promise.race([
                        ollamaBridge.listModels(force),
                        new Promise<string[]>((_, reject) => {
                            setTimeout(() => reject(new Error('Timeout: Ollama service may not be running.')), 5000);
                        })
                    ]);
                    if (!mountedRef.current) {
                        return modelsList;
                    }
                    setModels(modelsList);
                    setModelsLoaded(true);
                    setModelChecking(false);
                    setError(null);
                    return modelsList;
                } catch (err: any) {
                    lastError = err;
                    if (attempt < maxAttempts) {
                        await new Promise((resolve) => setTimeout(resolve, attemptInterval));
                    }
                }
            }

            const message = lastError?.message || 'Failed to list Ollama models. Make sure Ollama is running.';
            if (mountedRef.current) {
                setModelChecking(false);
                setError(message);
                setModelsLoaded(false);
            }
            return [];
        },
        [enabled, installed]
    );

    useEffect(() => {
        if (!enabled) {
            setInstalled(null);
            setModels([]);
            setModelDownloaded(null);
            setError(null);
            setModelError(null);
            setModelsLoaded(false);
            setModelChecking(false);
            return;
        }

        let cancelled = false;
        let attemptCount = 0;
        const performCheck = async (): Promise<void> => {
            if (cancelled) {
                return;
            }
            attemptCount += 1;
            setChecking(true);
            setError(null);
            setModelDownloaded(null);
            setModelsLoaded(false);

            try {
                const isInstalled = await ollamaBridge.checkInstalled();
                if (cancelled) {
                    return;
                }
                setInstalled(isInstalled);
                if (isInstalled) {
                    setError(null);
                    void refreshModels(true).catch((err: any) => {
                        if (!cancelled) {
                            setError(err?.message || 'Failed to list Ollama models.');
                        }
                    });
                } else {
                    setModels([]);
                    setModelDownloaded(null);
                    setModelsLoaded(false);
                }
            } catch (err: any) {
                if (cancelled) {
                    return;
                }
                if (attemptCount < installCheckAttempts) {
                    setTimeout(() => {
                        void performCheck();
                    }, installCheckIntervalMs);
                } else {
                    setInstalled(null);
                    setModels([]);
                    setModelDownloaded(null);
                    setError(err?.message || 'Failed to detect Ollama installation. Make sure Ollama is running.');
                    setModelsLoaded(false);
                }
            } finally {
                if (!cancelled) {
                    setChecking(false);
                }
            }
        };

        void performCheck();

        return () => {
            cancelled = true;
        };
    }, [enabled, refreshModels, installCheckAttempts, installCheckIntervalMs, installProbe]);

    useEffect(() => {
        if (!enabled || !installed || !normalizedModel) {
            setModelDownloaded(null);
            return;
        }
        if (!modelsLoaded) {
            return;
        }
        const isDownloaded = models.includes(normalizedModel);
        setModelDownloaded(isDownloaded);
    }, [enabled, installed, normalizedModel, models, modelsLoaded]);

    useEffect(() => {
        if (!enabled || !normalizedModel) {
            setModelDownloading(false);
            return;
        }
        const unsubscribe = subscribeToOllamaDownloads((downloadSet) => {
            if (!mountedRef.current) {
                return;
            }
            setModelDownloading(downloadSet.has(normalizedModel));
        });
        return () => {
            unsubscribe();
        };
    }, [enabled, normalizedModel]);

    useEffect(() => {
        if (!enabled || !normalizedModel) {
            setModelWarming(false);
            return;
        }
        const unsubscribe = subscribeToOllamaWarmup((warmupSet) => {
            if (!mountedRef.current) {
                return;
            }
            setModelWarming(warmupSet.has(normalizedModel));
        });
        return () => {
            unsubscribe();
        };
    }, [enabled, normalizedModel]);

    return {
        installed,
        checking,
        error,
        models,
        modelsLoaded,
        modelChecking,
        modelDownloaded,
        setModelDownloaded,
        modelDownloading,
        setModelDownloading,
        modelWarming,
        modelError,
        setModelError,
        setError,
        refreshModels,
        recheckInstall: () => setInstallProbe((value) => value + 1)
    };
};
