import React, {forwardRef, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    Box,
    Button,
    CircularProgress,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Fade,
    IconButton,
    MenuItem,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import {
    LLM_API_MODELS,
    LLM_GEMINI_API_MODELS,
    LLM_LOCAL_MODELS,
    LLM_MODES,
    LLM_OPENAI_API_MODELS,
    SPEECH_API_MODELS,
    SPEECH_GOOGLE_API_MODELS,
    SPEECH_LOCAL_MODELS,
    SPEECH_MODES,
    SPEECH_OPENAI_API_MODELS
} from '@shared/constants';
import type {FastWhisperStatus, LLMMode, LLMModel, TranscribeMode, TranscribeModel} from '@shared/types';
import LocalSpeechInstallControl from './LocalSpeechInstallControl';
import {
    checkLocalModelDownloaded,
    downloadLocalSpeechModel,
    getLocalSpeechModelMetadata,
    normalizeLocalSpeechModelName,
    subscribeToLocalModelWarmup,
    warmupLocalSpeechModel
} from '../services/localSpeechModels';
import {
    checkOllamaInstalled,
    downloadOllamaModel,
    listInstalledOllamaModels,
    normalizeOllamaModelName,
    subscribeToOllamaDownloads,
    subscribeToOllamaWarmup,
    warmupOllamaModel as warmupOllamaModelService
} from '../services/ollama';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';

export interface ModelConfigFormData {
    openaiKey: string;
    googleKey: string;
    transcribeMode: TranscribeMode;
    transcribeModel: TranscribeModel;
    llmMode: LLMMode;
    llmModel: LLMModel;
}

const getDefaultTranscribeModel = (mode: TranscribeMode): TranscribeModel =>
    (mode === SPEECH_MODES.API ? SPEECH_API_MODELS[0] : SPEECH_LOCAL_MODELS[0]) as TranscribeModel;

const getDefaultLLMModel = (mode: LLMMode): LLMModel =>
    (mode === LLM_MODES.API ? LLM_API_MODELS[0] : LLM_LOCAL_MODELS[0]) as LLMModel;

const OPENAI_API_MODEL_SET = new Set<string>([...LLM_OPENAI_API_MODELS]);
const GEMINI_API_MODEL_SET = new Set<string>([...LLM_GEMINI_API_MODELS]);
const OPENAI_TRANSCRIBE_MODEL_SET = new Set<string>([...SPEECH_OPENAI_API_MODELS]);
const GOOGLE_TRANSCRIBE_MODEL_SET = new Set<string>([...SPEECH_GOOGLE_API_MODELS]);

const isGeminiApiModel = (model: LLMModel): boolean => GEMINI_API_MODEL_SET.has(model as string);
const isOpenAiApiModel = (model: LLMModel): boolean => OPENAI_API_MODEL_SET.has(model as string);
const isOpenAiTranscribeModel = (model: TranscribeModel): boolean => OPENAI_TRANSCRIBE_MODEL_SET.has(model as string);
const isGoogleTranscribeModel = (model: TranscribeModel): boolean => GOOGLE_TRANSCRIBE_MODEL_SET.has(model as string);
const LOCAL_LLM_MODEL_SET = new Set<string>([...LLM_LOCAL_MODELS].map((model) => model as string));
const LOCAL_LLM_SIZE_HINTS: Record<string, string> = {
    'gpt-oss:120b': '≈90 GB',
    'gpt-oss:20b': '≈13 GB',
    'gemma3:27b': '≈21 GB',
    'gemma3:12b': '≈9.5 GB',
    'gemma3:4b': '≈2.2 GB',
    'gemma3:1b': '≈815 MB',
    'deepseek-r1:8b': '≈5.5 GB',
    'qwen3-coder:30b': '≈23 GB',
    'qwen3:30b': '≈23 GB',
    'qwen3:8b': '≈5.2 GB',
    'qwen3:4b': '≈2.5 GB'
};
const FAST_WHISPER_INSTALL_SIZE_HINT = '≈43 MB';
type ModeInfoDialogType = 'transcribe' | 'llm';

const MODE_INFO_DIALOG_CONTENT: Record<ModeInfoDialogType, {
    title: string;
    description: string;
    bullets: string[]
}> = {
    transcribe: {
        title: 'Local Transcribe Mode',
        description:
            'Audio is processed entirely on your machine via the bundled FastWhisper server. The server itself occupies roughly 43 MB and works offline once the model is warmed up.',
        bullets: [
            'Available model sizes: Tiny 75 MB, Base 141 MB, Small 463 MB, Medium 1.42 GB, Large v3 3 GB (aka Florcheva 3).',
            'If you lack an NVIDIA GPU the engine falls back to CPU, so Medium/Large v3 models will run noticeably slower.',
            'Best results come from using an NVIDIA GPU with the Large v3 model; warmup may temporarily block the microphone.',
            'Everything stays offline, with no API quotas or token costs once installed.'
        ]
    },
    llm: {
        title: 'Local LLM Mode',
        description:
            'Responses are generated through your local Ollama runtime. Winky communicates with the Ollama HTTP server, so everything stays on-device.',
        bullets: [
            'Requires Ollama to be installed and running in the background.',
            'LLM weights are downloaded once per model and stored locally.',
            'Without a discrete GPU (CUDA/Metal) expect inference and warmup to take significantly longer, especially on 20B+ models.',
            'Completely offline after download — no API keys or internet connection required.'
        ]
    }
};

interface ModelConfigFormProps {
    values: ModelConfigFormData;
    onChange: (values: ModelConfigFormData) => void;
    saving: boolean;
    requireApiKeys?: boolean;
    autoSave?: boolean;
    onAutoSave?: (nextValues: ModelConfigFormData) => Promise<void>;
    onSubmit?: (e: React.FormEvent) => void;
    submitButtonText?: string;
}

const ModelConfigForm: React.FC<ModelConfigFormProps> = ({
                                                             values,
                                                             onChange,
                                                             saving,
                                                             requireApiKeys = false,
                                                             autoSave = false,
                                                             onAutoSave,
                                                             onSubmit,
                                                             submitButtonText = 'Save'
                                                         }) => {
    const shouldAutoSave = autoSave && typeof onAutoSave === 'function';
    const disableInputs = saving && !shouldAutoSave;
    const [modeInfoDialog, setModeInfoDialog] = useState<ModeInfoDialogType | null>(null);
    const [modeInfoDialogContentType, setModeInfoDialogContentType] = useState<ModeInfoDialogType>('transcribe');
    const [localModelDownloaded, setLocalModelDownloaded] = useState<boolean | null>(null);
    const [localModelVerifiedFor, setLocalModelVerifiedFor] = useState<string | null>(null);
    const [checkingLocalModel, setCheckingLocalModel] = useState(false);
    const [downloadingLocalModel, setDownloadingLocalModel] = useState(false);
    const [localModelError, setLocalModelError] = useState<string | null>(null);
    const [localServerStatus, setLocalServerStatus] = useState<FastWhisperStatus | null>(null);
    const [localWarmupInProgress, setLocalWarmupInProgress] = useState(false);
    const [ollamaInstalled, setOllamaInstalled] = useState<boolean | null>(null);
    const [ollamaChecking, setOllamaChecking] = useState(false);
    const [ollamaError, setOllamaError] = useState<string | null>(null);
    const [ollamaModels, setOllamaModels] = useState<string[]>([]);
    const [ollamaModelChecking, setOllamaModelChecking] = useState(false);
    const [ollamaModelDownloaded, setOllamaModelDownloaded] = useState<boolean | null>(null);
    const [ollamaDownloadingModel, setOllamaDownloadingModel] = useState(false);
    const [ollamaModelError, setOllamaModelError] = useState<string | null>(null);
    const [ollamaModelsLoaded, setOllamaModelsLoaded] = useState(false);
    const [ollamaModelWarming, setOllamaModelWarming] = useState(false);
    const checkingRef = useRef<string | null>(null);
    const warmupRequestRef = useRef<string | null>(null);
    const normalizedSpeechModel = useMemo(
        () => normalizeLocalSpeechModelName(values.transcribeModel),
        [values.transcribeModel]
    );
    const normalizedLlmModel = useMemo(
        () => normalizeOllamaModelName(values.llmModel),
        [values.llmModel]
    );
    const selectedLocalModelMeta = useMemo(
        () => getLocalSpeechModelMetadata(values.transcribeModel),
        [values.transcribeModel]
    );
    const selectedLocalModelDescription = selectedLocalModelMeta
        ? `${selectedLocalModelMeta.label} (${selectedLocalModelMeta.size})`
        : null;

    const handleModeInfoClick = useCallback(
        (event: React.MouseEvent, dialogType: ModeInfoDialogType) => {
            event.preventDefault();
            event.stopPropagation();
            if (disableInputs) {
                return;
            }
            setModeInfoDialogContentType(dialogType);
            setModeInfoDialog(dialogType);
        },
        [disableInputs]
    );

    const closeModeInfoDialog = useCallback(() => {
        setModeInfoDialog(null);
    }, []);

    useEffect(() => {
        let mounted = true;
        const fetchStatus = async (checkHealth: boolean = false) => {
            if (!mounted) {
                return;
            }
            try {
                const status = checkHealth
                    ? await window.winky?.localSpeech?.checkHealth()
                    : await window.winky?.localSpeech?.getStatus();
                if (mounted && status) {
                    setLocalServerStatus(status);
                }
            } catch (error) {
                console.warn('[ModelConfigForm] Failed to fetch local server status', error);
            }
        };
        void fetchStatus(true);
        const unsubscribe = window.winky?.localSpeech?.onStatus?.((status) => {
            if (mounted) {
                setLocalServerStatus(status);
            }
        });
        return () => {
            mounted = false;
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        if (values.transcribeMode !== SPEECH_MODES.LOCAL) {
            setLocalWarmupInProgress(false);
            warmupRequestRef.current = null;
            return;
        }
        if (!normalizedSpeechModel) {
            setLocalWarmupInProgress(false);
            warmupRequestRef.current = null;
            return;
        }
        const unsubscribe = subscribeToLocalModelWarmup((activeModels) => {
            setLocalWarmupInProgress(activeModels.has(normalizedSpeechModel));
        });
        return () => {
            unsubscribe();
        };
    }, [values.transcribeMode, normalizedSpeechModel]);

    useEffect(() => {
        const normalized = normalizedSpeechModel;

        if (values.transcribeMode !== SPEECH_MODES.LOCAL || !normalized) {
            setLocalModelDownloaded(null);
            setLocalModelVerifiedFor(null);
            setCheckingLocalModel(false);
            setLocalModelError(null);
            checkingRef.current = null;
            return;
        }

        if (!localServerStatus?.installed || !localServerStatus?.running) {
            setLocalModelDownloaded(null);
            setLocalModelVerifiedFor(null);
            setCheckingLocalModel(false);
            setLocalModelError(null);
            checkingRef.current = null;
            return;
        }

        const modelKey = `${values.transcribeMode}:${normalized}`;
        if (checkingRef.current === modelKey) {
            return;
        }

        checkingRef.current = modelKey;
        let cancelled = false;
        setLocalModelDownloaded(null);
        setLocalModelVerifiedFor(null);
        setLocalModelError(null);

        const checkModel = async () => {
            console.log(`[ModelConfigForm] Запуск проверки модели: ${normalized}`);
            setCheckingLocalModel(true);
            setLocalModelError(null);
            try {
                const downloaded = await checkLocalModelDownloaded(normalized, {force: true});
                if (!cancelled) {
                    setLocalModelDownloaded(downloaded);
                    setLocalModelVerifiedFor(downloaded ? normalized : null);
                    setCheckingLocalModel(false);
                }
            } catch (error: any) {
                if (!cancelled) {
                    setLocalModelDownloaded(false);
                    setLocalModelVerifiedFor(null);
                    setCheckingLocalModel(false);
                    setLocalModelError(error?.message || 'Failed to verify the model.');
                }
            }
        };

        void checkModel();

        return () => {
            cancelled = true;
            if (checkingRef.current === modelKey) {
                checkingRef.current = null;
            }
        };
    }, [
        values.transcribeMode,
        normalizedSpeechModel,
        localServerStatus?.installed,
        localServerStatus?.running
    ]);

    useEffect(() => {
        const normalized = normalizedSpeechModel;
        if (values.transcribeMode !== SPEECH_MODES.LOCAL || !normalized) {
            warmupRequestRef.current = null;
            return;
        }
        if (!localServerStatus?.installed || !localServerStatus?.running) {
            warmupRequestRef.current = null;
            return;
        }
        if (checkingLocalModel || downloadingLocalModel || !localModelDownloaded) {
            return;
        }
        if (localModelVerifiedFor !== normalized) {
            return;
        }
        if (localWarmupInProgress) {
            return;
        }
        if (warmupRequestRef.current === normalized) {
            return;
        }

        let cancelled = false;
        warmupRequestRef.current = normalized;
        const run = async () => {
            try {
                await warmupLocalSpeechModel(normalized);
            } catch (error) {
                console.error('[ModelConfigForm] Failed to warmup model', error);
                if (!cancelled) {
                    setLocalModelError('Failed to warm up the model. Please try again later.');
                }
                warmupRequestRef.current = null;
            }
        };
        void run();

        return () => {
            cancelled = true;
        };
    }, [
        values.transcribeMode,
        normalizedSpeechModel,
        localServerStatus?.installed,
        localServerStatus?.running,
        localModelDownloaded,
        localModelVerifiedFor,
        checkingLocalModel,
        downloadingLocalModel,
        localWarmupInProgress
    ]);

    const refreshOllamaModels = useCallback(
        async (force: boolean = false, maxAttempts: number = 25, attemptInterval: number = 1000): Promise<string[]> => {
            if (!ollamaInstalled) {
                setOllamaModels([]);
                setOllamaModelsLoaded(false);
                return [];
            }
            setOllamaModelChecking(true);
            setOllamaModelsLoaded(false);

            let lastError: any = null;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    // Проверка с таймаутом, чтобы не блокировать UI
                    const models = await Promise.race([
                        listInstalledOllamaModels({force}),
                        new Promise<string[]>((_, reject) => {
                            setTimeout(() => reject(new Error('Timeout: Ollama service may not be running.')), attemptInterval);
                        })
                    ]);
                    // Если проверка успешна, останавливаем цикл
                    setOllamaModels(models);
                    setOllamaModelsLoaded(true);
                    setOllamaModelChecking(false);
                    setOllamaError(null);
                    return models;
                } catch (error: any) {
                    lastError = error;
                    console.warn(`[ModelConfigForm] Failed to list Ollama models (attempt ${attempt}/${maxAttempts}):`, error);

                    // Если это не последняя попытка, ждем перед следующей
                    if (attempt < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, attemptInterval));
                    }
                }
            }

            // После всех попыток показываем ошибку
            setOllamaModelChecking(false);
            const errorMessage = lastError?.message || 'Failed to list Ollama models. Make sure Ollama is running.';
            setOllamaError(errorMessage);
            setOllamaModelsLoaded(false);
            return [];
        },
        [ollamaInstalled]
    );

    useEffect(() => {
        if (values.llmMode !== LLM_MODES.LOCAL) {
            setOllamaInstalled(null);
            setOllamaModels([]);
            setOllamaModelDownloaded(null);
            setOllamaError(null);
            setOllamaModelsLoaded(false);
            return;
        }
        let cancelled = false;
        let attemptCount = 0;
        const maxAttempts = 3;
        const checkInterval = 5000; // 5 секунд

        const performCheck = async (): Promise<void> => {
            if (cancelled) {
                return;
            }
            attemptCount += 1;
            setOllamaChecking(true);
            setOllamaError(null);
            setOllamaModelDownloaded(null);
            setOllamaModelsLoaded(false);

            try {
                const installed = await checkOllamaInstalled();
                if (cancelled) {
                    return;
                }
                setOllamaInstalled(installed);
                if (installed) {
                    setOllamaError(null);
                    // Загружаем модели с автоматическими повторными попытками (25 попыток по 1 секунде)
                    void refreshOllamaModels(true, 25, 1000).catch((error: any) => {
                        if (!cancelled) {
                            console.error('[ModelConfigForm] Failed to refresh ollama models after all attempts:', error);
                            // Ошибка уже установлена в refreshOllamaModels
                        }
                    });
                    setOllamaChecking(false);
                } else {
                    setOllamaModels([]);
                    setOllamaModelDownloaded(null);
                    setOllamaModelsLoaded(false);
                    setOllamaChecking(false);
                }
            } catch (error: any) {
                if (cancelled) {
                    return;
                }
                // Если это не последняя попытка, повторяем через интервал
                if (attemptCount < maxAttempts) {
                    setOllamaChecking(true);
                    setTimeout(() => {
                        void performCheck();
                    }, checkInterval);
                } else {
                    // После всех попыток показываем ошибку
                    setOllamaInstalled(null);
                    setOllamaModels([]);
                    setOllamaModelDownloaded(null);
                    setOllamaError(error?.message || 'Failed to detect Ollama installation. Make sure Ollama is running.');
                    setOllamaModelsLoaded(false);
                    setOllamaChecking(false);
                }
            }
        };

        void performCheck();

        return () => {
            cancelled = true;
        };
    }, [values.llmMode, refreshOllamaModels]);

    useEffect(() => {
        if (values.llmMode !== LLM_MODES.LOCAL || !ollamaInstalled || !normalizedLlmModel) {
            setOllamaModelDownloaded(null);
            return;
        }

        // Не обновляем состояние пока модели не загружены
        if (!ollamaModelsLoaded) {
            // Если модели еще не загружены, оставляем null (показываем проверку)
            return;
        }

        // Устанавливаем состояние только один раз после загрузки
        const isDownloaded = ollamaModels.includes(normalizedLlmModel);
        setOllamaModelDownloaded(isDownloaded);
    }, [values.llmMode, ollamaInstalled, normalizedLlmModel, ollamaModels, ollamaModelsLoaded]);

    useEffect(() => {
        const unsubscribe = subscribeToOllamaDownloads((models) => {
            if (values.llmMode !== LLM_MODES.LOCAL || !normalizedLlmModel) {
                setOllamaDownloadingModel(false);
                return;
            }
            setOllamaDownloadingModel(models.has(normalizedLlmModel));
        });
        return () => {
            unsubscribe();
        };
    }, [values.llmMode, normalizedLlmModel]);

    useEffect(() => {
        const unsubscribe = subscribeToOllamaWarmup((models) => {
            if (values.llmMode !== LLM_MODES.LOCAL || !normalizedLlmModel) {
                setOllamaModelWarming(false);
                return;
            }
            setOllamaModelWarming(models.has(normalizedLlmModel));
        });
        return () => {
            unsubscribe();
        };
    }, [values.llmMode, normalizedLlmModel]);

    const handleDownloadModel = useCallback(async () => {
        if (values.transcribeMode !== SPEECH_MODES.LOCAL || downloadingLocalModel) {
            return;
        }
        const metadata = getLocalSpeechModelMetadata(values.transcribeModel);
        if (metadata) {
            console.info(`[ModelConfigForm] Скачиваем ${metadata.label} (${metadata.size})…`);
        }
        setLocalModelError(null);
        setDownloadingLocalModel(true);
        try {
            await downloadLocalSpeechModel(values.transcribeModel);
            const downloaded = await checkLocalModelDownloaded(values.transcribeModel, {force: true});
            setLocalModelDownloaded(downloaded);
            if (metadata) {
                console.info(`[ModelConfigForm] ${metadata.label} (${metadata.size}) скачана.`);
            }
            try {
                await warmupLocalSpeechModel(values.transcribeModel);
            } catch {
                setLocalModelError('The model was downloaded but warmup failed. Please try again later.');
            }
        } catch (error: any) {
            const detail = error?.response?.data?.detail;
            setLocalModelError(
                detail || error?.message || 'Failed to download the model. Please check the local server.'
            );
        } finally {
            setDownloadingLocalModel(false);
        }
    }, [downloadingLocalModel, values.transcribeMode, values.transcribeModel]);

    const handleDownloadLlmModel = useCallback(async () => {
        if (values.llmMode !== LLM_MODES.LOCAL || ollamaDownloadingModel) {
            return;
        }
        const model = values.llmModel;
        if (!model) {
            return;
        }
        setOllamaModelError(null);
        setOllamaDownloadingModel(true);
        try {
            await downloadOllamaModel(model);
            await refreshOllamaModels(true);
            setOllamaModelDownloaded(true);
            try {
                await warmupOllamaModelService(model);
            } catch {
                setOllamaModelError('Model downloaded but warmup failed. Please try again later.');
            }
        } catch (error: any) {
            setOllamaModelError(error?.message || 'Failed to download the model. Check the Ollama CLI.');
        } finally {
            setOllamaDownloadingModel(false);
        }
    }, [values.llmMode, values.llmModel, ollamaDownloadingModel, refreshOllamaModels]);

    const formatLabel = (value: string) =>
        value
            .replace(/[:]/g, ' ')
            .replace(/-/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');

    const formatLLMLabel = (value: string) => {
        const base = formatLabel(value);
        if (isGeminiApiModel(value as LLMModel)) {
            return `Google ${base}`;
        }
        if (isOpenAiApiModel(value as LLMModel)) {
            return `OpenAI ${base}`;
        }
        const normalized = normalizeOllamaModelName(value);
        const size = LOCAL_LLM_SIZE_HINTS[normalized];
        if (size) {
            return `${base} · ${size}`;
        }
        return base;
    };
    const selectedLocalLLMDescription = useMemo(
        () => formatLLMLabel(values.llmModel),
        [values.llmModel]
    );

    const formatTranscribeLabel = (value: string) => {
        const localMeta = getLocalSpeechModelMetadata(value);
        if (localMeta) {
            return `${localMeta.label} · ${localMeta.size}`;
        }
        const base = formatLabel(value);
        if (isGoogleTranscribeModel(value as TranscribeModel)) {
            return `Google ${base}`;
        }
        if (isOpenAiTranscribeModel(value as TranscribeModel)) {
            return `OpenAI ${base}`;
        }
        return base;
    };

    const transcribeModelOptions = useMemo<TranscribeModel[]>(() => {
        if (values.transcribeMode === SPEECH_MODES.API) {
            const models: string[] = [...SPEECH_OPENAI_API_MODELS];
            if (values.googleKey.trim().length > 0) {
                models.push(...SPEECH_GOOGLE_API_MODELS);
            }
            return models as TranscribeModel[];
        }
        return [...SPEECH_LOCAL_MODELS] as TranscribeModel[];
    }, [values.transcribeMode, values.googleKey]);

    const llmModelOptions = useMemo<LLMModel[]>(() => {
        if (values.llmMode === LLM_MODES.API) {
            const apiModels: string[] = [...LLM_OPENAI_API_MODELS];
            if (values.googleKey.trim().length > 0) {
                apiModels.push(...LLM_GEMINI_API_MODELS);
            }
            return apiModels as LLMModel[];
        }
        return [...LLM_LOCAL_MODELS] as LLMModel[];
    }, [values.llmMode, values.googleKey]);

    const emitChange = useCallback((partial: Partial<ModelConfigFormData>) => {
        const nextValues = {...values, ...partial};
        onChange(nextValues);
        if (shouldAutoSave && onAutoSave) {
            void onAutoSave(nextValues);
        }
    }, [values, onChange, shouldAutoSave, onAutoSave]);

    useEffect(() => {
        if (values.transcribeMode !== SPEECH_MODES.LOCAL) {
            return;
        }
        if (selectedLocalModelMeta && selectedLocalModelMeta.id !== values.transcribeModel) {
            emitChange({transcribeModel: selectedLocalModelMeta.id as TranscribeModel});
        }
    }, [values.transcribeMode, values.transcribeModel, selectedLocalModelMeta, emitChange]);

    useEffect(() => {
        if (!transcribeModelOptions.includes(values.transcribeModel)) {
            emitChange({transcribeModel: transcribeModelOptions[0] as TranscribeModel});
        }
    }, [transcribeModelOptions, values.transcribeModel, emitChange]);

    useEffect(() => {
        if (!llmModelOptions.includes(values.llmModel)) {
            emitChange({llmModel: llmModelOptions[0] as LLMModel});
        }
    }, [llmModelOptions, values.llmModel, emitChange]);

    useEffect(() => {
        setOllamaModelError(null);
    }, [values.llmModel]);

    const ModeInfoDialogTransition = forwardRef(function ModeInfoDialogTransition(
        props: React.ComponentProps<typeof Fade>,
        ref: React.Ref<unknown>
    ) {
        return <Fade timeout={200} ref={ref} {...props} />;
    });

    const renderModeInfoButton = (type: ModeInfoDialogType, disabledButton: boolean) => (
        <IconButton
            size="small"
            onClick={(event) => handleModeInfoClick(event, type)}
            disabled={disabledButton}
            sx={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                borderRadius: '50%',
                width: 28,
                height: 28,
                backgroundColor: 'transparent',
                color: 'rgba(0,0,0,0.3)',
                boxShadow: 'none',
                '&:hover': {
                    color: 'rgba(0,0,0,1)',
                    backgroundColor: 'transparent',
                    boxShadow: 'none'
                },
                '&:active': {
                    boxShadow: 'none'
                },
                '&.Mui-disabled': {
                    color: 'rgba(0,0,0,0.12)',
                    boxShadow: 'none'
                },
                '&:focus-visible': {
                    boxShadow: 'none'
                }
            }}
            aria-label={
                type === 'transcribe' ? 'Local transcribe mode details' : 'Local LLM mode details'
            }
        >
            <ErrorOutlineRoundedIcon fontSize="small"/>
        </IconButton>
    );

    const renderTranscribeModeSelector = (sx?: any) => (
        <Box sx={{position: 'relative', width: '100%'}}>
            <TextField
                select
                label="Transcribe Mode"
                value={values.transcribeMode}
                onChange={(e) => {
                    const transcribeMode = e.target.value as TranscribeMode;
                    const transcribeModel = getDefaultTranscribeModel(transcribeMode);
                    emitChange({transcribeMode, transcribeModel});
                }}
                disabled={disableInputs}
                fullWidth
                sx={sx}
                slotProps={{
                    select: {
                        sx: {pr: 8}
                    }
                }}
            >
                <MenuItem value={SPEECH_MODES.API}>API</MenuItem>
                <MenuItem value={SPEECH_MODES.LOCAL}>Local</MenuItem>
            </TextField>
            {renderModeInfoButton('transcribe', disableInputs)}
        </Box>
    );

    const requiresOpenAIKeyForLLM = values.llmMode === LLM_MODES.API && isOpenAiApiModel(values.llmModel);
    const requiresGoogleKeyForLLM = values.llmMode === LLM_MODES.API && isGeminiApiModel(values.llmModel);
    const requiresOpenAIKeyForTranscribe =
        values.transcribeMode === SPEECH_MODES.API && isOpenAiTranscribeModel(values.transcribeModel);
    const requiresGoogleKeyForTranscribe =
        values.transcribeMode === SPEECH_MODES.API && isGoogleTranscribeModel(values.transcribeModel);
    const requiresOpenAIKey = requiresOpenAIKeyForLLM || requiresOpenAIKeyForTranscribe;
    const requiresGoogleKey = requiresGoogleKeyForLLM || requiresGoogleKeyForTranscribe;
    const googleKeyReasons: string[] = [];
    if (requiresGoogleKeyForTranscribe) {
        googleKeyReasons.push('Google Gemini speech transcription');
    }
    if (requiresGoogleKeyForLLM) {
        googleKeyReasons.push('Google Gemini LLM models');
    }
    const openaiKeyReasons: string[] = [];
    if (requiresOpenAIKeyForTranscribe) {
        openaiKeyReasons.push('OpenAI speech recognition');
    }
    if (requiresOpenAIKeyForLLM) {
        openaiKeyReasons.push('OpenAI GPT models');
    }
    const needsAnyApiKey = requireApiKeys && (requiresOpenAIKey || requiresGoogleKey);
    const shouldShowOpenAIField =
        values.llmMode === LLM_MODES.API ||
        values.transcribeMode === SPEECH_MODES.API ||
        values.openaiKey.trim().length > 0;
    const isLocalLLMMode = values.llmMode === LLM_MODES.LOCAL;
    const disableLlmModelSelect = disableInputs || (isLocalLLMMode && (ollamaChecking || !ollamaInstalled));
    const checkingMessage = selectedLocalModelDescription
        ? `Checking if ${selectedLocalModelDescription} is available…`
        : 'Checking if the model is available…';
    const downloadedMessage = selectedLocalModelDescription
        ? `${selectedLocalModelDescription} is downloaded and ready to use.`
        : 'The model is downloaded and ready to use.';
    const downloadButtonLabel = selectedLocalModelDescription
        ? downloadingLocalModel
            ? `Downloading ${selectedLocalModelDescription}…`
            : `Download ${selectedLocalModelDescription}`
        : downloadingLocalModel
            ? 'Downloading…'
            : 'Download model';
    const warmupWarningMessage = selectedLocalModelDescription
        ? `${selectedLocalModelDescription} is warming up. Using the microphone is temporarily unavailable.`
        : 'The model is warming up. Using the microphone is temporarily unavailable.';
    const llmCheckingMessage = selectedLocalLLMDescription
        ? `Checking if ${selectedLocalLLMDescription} is available…`
        : 'Checking if the model is available…';
    const llmDownloadedMessage = selectedLocalLLMDescription
        ? `${selectedLocalLLMDescription} is downloaded and ready to use.`
        : 'The model is downloaded and ready to use.';
    const llmDownloadButtonLabel = selectedLocalLLMDescription
        ? ollamaDownloadingModel
            ? `Downloading ${selectedLocalLLMDescription}…`
            : `Download ${selectedLocalLLMDescription}`
        : ollamaDownloadingModel
            ? 'Downloading…'
            : 'Download model';
    const llmWarmupWarningMessage = selectedLocalLLMDescription
        ? `${selectedLocalLLMDescription} is warming up. Using the microphone is temporarily unavailable.`
        : 'The model is warming up. Using the microphone is temporarily unavailable.';
    const modeInfoDialogDetails = MODE_INFO_DIALOG_CONTENT[modeInfoDialogContentType];

    return (
        <>
            <Box
                component={shouldAutoSave ? 'div' : 'form'}
                onSubmit={shouldAutoSave ? undefined : onSubmit}
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    borderRadius: 4,
                    border: '1px solid rgba(244,63,94,0.15)',
                    backgroundColor: '#fff',
                    p: {xs: 3, md: 4},
                    boxShadow: '0 30px 60px rgba(255, 255, 255, 0.03)'
                }}
            >
                <Stack spacing={2}>
                    <Typography variant="h6" color="text.primary" fontWeight={600}>
                        Modes and Models
                    </Typography>
                    <Box
                        sx={{
                            display: 'grid',
                            gap: 2,
                            gridTemplateColumns: {xs: 'repeat(1, minmax(0, 1fr))', md: 'repeat(2, minmax(0, 1fr))'}
                        }}
                    >
                        <div className={'fc gap-2'}>
                            {renderTranscribeModeSelector({flex: 1})}
                            <Collapse in={values.transcribeMode === SPEECH_MODES.LOCAL} unmountOnExit>
                                <LocalSpeechInstallControl disabled={disableInputs}/>
                            </Collapse>
                        </div>
                        <div className={'fc gap-1'}>
                            <TextField
                                select
                                label="Transcribe Model"
                                value={values.transcribeModel}
                                onChange={(e) => {
                                    const newModel = e.target.value as TranscribeModel;
                                    emitChange({transcribeModel: newModel});
                                }}
                                disabled={disableInputs || (values.transcribeMode === SPEECH_MODES.LOCAL && (!localServerStatus?.installed || !localServerStatus?.running))}
                            >
                                {transcribeModelOptions.map((model) => (
                                    <MenuItem key={model} value={model}>
                                        {formatTranscribeLabel(model)}
                                    </MenuItem>
                                ))}
                            </TextField>
                            {values.transcribeMode === SPEECH_MODES.LOCAL && localServerStatus?.installed && localServerStatus?.running && (
                                <div className={'fc w-full flex-grow'}>
                                    {(checkingLocalModel || localModelDownloaded === null) && (
                                        <Typography
                                            variant="body2"
                                            color="text.secondary"
                                            sx={{display: 'flex', gap: 1}}
                                        >
                                            <CircularProgress size={16} thickness={5} color="inherit"/>
                                            {checkingMessage}
                                        </Typography>
                                    )}
                                    {!checkingLocalModel && localWarmupInProgress && (
                                        <Typography
                                            variant="body2"
                                            color="warning.main"
                                            sx={{display: 'flex', gap: 1}}
                                        >
                                            <CircularProgress
                                                size={20}
                                                thickness={5}
                                                sx={{color: 'warning.main', flexShrink: 0, mt: '3px'}}
                                            />
                                            {warmupWarningMessage}
                                        </Typography>
                                    )}
                                    {!checkingLocalModel && !localWarmupInProgress && localModelDownloaded === true && (
                                        <Typography
                                            variant="body2"
                                            color="success.main"
                                            sx={{display: 'flex', gap: 1}}
                                        >
                                            <CheckCircleIcon style={{marginTop: 3}} fontSize="small"/>
                                            {downloadedMessage}
                                        </Typography>
                                    )}
                                    {!checkingLocalModel && localModelDownloaded === false && (
                                        <Button
                                            variant="contained"
                                            color="primary"
                                            onClick={handleDownloadModel}
                                            disabled={disableInputs || downloadingLocalModel}
                                            startIcon={downloadingLocalModel ? (
                                                <CircularProgress size={18} thickness={5} color="inherit"/>
                                            ) : undefined}
                                            sx={{mt: 0.5, minHeight: '51px'}}
                                        >
                                            {downloadButtonLabel}
                                        </Button>
                                    )}
                                    {localModelError && (
                                        <Typography variant="body2" color="error" sx={{mt: 0.5}}>
                                            {localModelError}
                                        </Typography>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className={'fc gap-1'}>
                            <Box sx={{position: 'relative', width: '100%'}}>
                                <TextField
                                    select
                                    label="LLM Mode"
                                    value={values.llmMode}
                                    onChange={(e) => {
                                        const llmMode = e.target.value as LLMMode;
                                        const llmModel = getDefaultLLMModel(llmMode);
                                        emitChange({llmMode, llmModel});
                                    }}
                                    disabled={disableInputs}
                                    fullWidth
                                    slotProps={{
                                        select: {
                                            sx: {pr: 8}
                                        }
                                    }}
                                >
                                    <MenuItem value={LLM_MODES.API}>API</MenuItem>
                                    <MenuItem value={LLM_MODES.LOCAL}>Local</MenuItem>
                                </TextField>
                                {renderModeInfoButton('llm', disableInputs)}
                            </Box>
                            {isLocalLLMMode && (
                                <Box sx={{width: '100%'}}>
                                    {ollamaChecking && (
                                        <Typography
                                            variant="body2"
                                            color="text.secondary"
                                            sx={{display: 'flex', alignItems: 'center', gap: 1}}
                                        >
                                            <CircularProgress size={16} thickness={5} color="inherit"/>
                                            Checking Ollama installation and model availability…
                                        </Typography>
                                    )}
                                    {!ollamaChecking && ollamaInstalled === false && (
                                        <Typography variant="body2" color="warning.main">
                                            Install{' '}
                                            <a
                                                href="https://ollama.com/download"
                                                target="_blank"
                                                rel="noreferrer noopener"
                                                style={{color: 'inherit', fontWeight: 600}}
                                            >
                                                Ollama
                                            </a>{' '}
                                            to enable local LLM models.
                                        </Typography>
                                    )}
                                    {!ollamaChecking && ollamaError && (
                                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap'}}>
                                            <Typography variant="body2" color="error" sx={{flex: 1, minWidth: 0}}>
                                                {ollamaError}
                                            </Typography>
                                            {(ollamaError.includes('Timeout') || ollamaError.includes('not be running') || ollamaError.includes('Make sure Ollama is running')) && (
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => {
                                                        setOllamaError(null);
                                                        setOllamaChecking(true);
                                                        setOllamaModelsLoaded(false);
                                                        checkOllamaInstalled()
                                                            .then((installed) => {
                                                                setOllamaInstalled(installed);
                                                                if (installed) {
                                                                    setOllamaError(null);
                                                                    void refreshOllamaModels(true, 25, 1000);
                                                                } else {
                                                                    setOllamaModels([]);
                                                                    setOllamaModelDownloaded(null);
                                                                    setOllamaModelsLoaded(false);
                                                                }
                                                            })
                                                            .catch((error: any) => {
                                                                setOllamaInstalled(false);
                                                                setOllamaModels([]);
                                                                setOllamaModelDownloaded(null);
                                                                setOllamaError(error?.message || 'Failed to detect Ollama installation.');
                                                                setOllamaModelsLoaded(false);
                                                            })
                                                            .finally(() => {
                                                                setOllamaChecking(false);
                                                            });
                                                    }}
                                                    sx={{flexShrink: 0}}
                                                >
                                                    Refresh
                                                </Button>
                                            )}
                                        </Box>
                                    )}
                                </Box>
                            )}
                        </div>

                        <div className={'fc gap-1'}>
                            <TextField
                                select
                                label="LLM Model"
                                value={values.llmModel}
                                onChange={(e) => emitChange({llmModel: e.target.value as LLMModel})}
                                disabled={disableLlmModelSelect}
                            >
                                {llmModelOptions.map((model) => (
                                    <MenuItem key={model} value={model}>
                                        {formatLLMLabel(model)}
                                    </MenuItem>
                                ))}
                            </TextField>
                            {isLocalLLMMode && ollamaInstalled && (
                                <Box sx={{width: '100%'}}>
                                    {(ollamaModelChecking || (!ollamaModelsLoaded && ollamaModelDownloaded === null)) && (
                                        <Typography
                                            variant="body2"
                                            color="text.secondary"
                                            sx={{display: 'flex', alignItems: 'center', gap: 1}}
                                        >
                                            <CircularProgress size={16} thickness={5} color="inherit"/>
                                            {llmCheckingMessage}
                                        </Typography>
                                    )}
                                    {ollamaModelsLoaded && !ollamaModelChecking && ollamaModelWarming && (
                                        <Typography
                                            variant="body2"
                                            color="warning.main"
                                            sx={{display: 'flex', alignItems: 'center', gap: 1}}
                                        >
                                            <CircularProgress
                                                size={22}
                                                thickness={5}
                                                sx={{color: 'warning.main', flexShrink: 0}}
                                            />
                                            {llmWarmupWarningMessage}
                                        </Typography>
                                    )}
                                    {ollamaModelsLoaded && !ollamaModelChecking && !ollamaModelWarming && ollamaModelDownloaded === true && (
                                        <Typography
                                            variant="body2"
                                            color="success.main"
                                            sx={{display: 'flex', gap: 1}}
                                        >
                                            <CheckCircleIcon style={{marginTop: 3}} fontSize="small"/>
                                            {llmDownloadedMessage}
                                        </Typography>
                                    )}
                                    {ollamaModelsLoaded && !ollamaModelChecking && ollamaModelDownloaded === false && (
                                        <Button
                                            variant="contained"
                                            color="primary"
                                            onClick={handleDownloadLlmModel}
                                            disabled={disableInputs || ollamaDownloadingModel}
                                            startIcon={
                                                ollamaDownloadingModel ? (
                                                    <CircularProgress size={18} thickness={5} color="inherit"/>
                                                ) : undefined
                                            }
                                            sx={{mt: 0.5, minHeight: '51px'}}
                                        >
                                            {llmDownloadButtonLabel}
                                        </Button>
                                    )}
                                    {ollamaModelError && (
                                        <Typography variant="body2" color="error" sx={{mt: 0.5}}>
                                            {ollamaModelError}
                                        </Typography>
                                    )}
                                </Box>
                            )}
                        </div>
                    </Box>
                </Stack>

                <div className={'fc gap-2'}>
                    <div className={'fc gap-1'}>
                        <Typography variant="h6" color="text.primary" fontWeight={600}>
                            API Keys
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Visit{' '}
                            <a
                                href="https://platform.openai.com/api-keys"
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-primary font-semibold"
                            >
                                OpenAI
                            </a>{' '}
                            or{' '}
                            <a
                                href="https://ai.google.dev/gemini-api"
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-primary font-semibold flex items-center gap-1 inline-flex"
                            >
                                GoogleAI
                                <span style={{color: '#16a34a', fontWeight: 300}}>free</span>
                            </a>{' '}
                            to generate these keys.
                        </Typography>
                    </div>
                    <div className={'fc gap-2 mt-1'}>
                        <TextField
                            id="google-key"
                            type="password"
                            label="Google AI API Key"
                            value={values.googleKey}
                            onChange={(e) => emitChange({googleKey: e.target.value})}
                            placeholder="AIza..."
                            required={requireApiKeys && requiresGoogleKey}
                            disabled={disableInputs}
                        />
                        {requireApiKeys && requiresGoogleKey && (
                            <Typography variant="caption" color="text.secondary">
                                Required for {googleKeyReasons.join(' + ')}.
                            </Typography>
                        )}
                    </div>

                    {shouldShowOpenAIField && (
                        <div className={'fc gap-2 mt-1'}>
                            <TextField
                                id="openai-key"
                                type="password"
                                label="OpenAI API Key"
                                value={values.openaiKey}
                                onChange={(e) => emitChange({openaiKey: e.target.value})}
                                placeholder="sk-..."
                                required={requireApiKeys && requiresOpenAIKey}
                                disabled={disableInputs}
                            />
                            {requireApiKeys && requiresOpenAIKey && (
                                <Typography variant="caption" color="text.secondary">
                                    Required for {openaiKeyReasons.join(' + ')}.
                                </Typography>
                            )}
                        </div>
                    )}
                </div>

                {!shouldAutoSave && onSubmit && (
                    <Box display="flex" justifyContent="flex-end" mt={2}>
                        <Button type="submit" variant="contained" size="large" disabled={saving} sx={{px: 4}}>
                            {saving ? 'Saving…' : submitButtonText}
                        </Button>
                    </Box>
                )}
            </Box>

            {modeInfoDialog && (
                <Dialog
                    open
                    onClose={closeModeInfoDialog}
                    maxWidth="sm"
                    slots={{transition: ModeInfoDialogTransition}}
                    slotProps={{
                        paper: {
                            sx: {borderRadius: 3}
                        }
                    }}
                >
                    <DialogTitle>{modeInfoDialogDetails.title}</DialogTitle>
                    <DialogContent dividers>
                        <Typography variant="body1" color="text.primary">
                            {modeInfoDialogDetails.description}
                        </Typography>
                        <Box
                            component="ul"
                            sx={{
                                mt: 2,
                                pl: 3,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 1,
                                color: 'text.primary'
                            }}
                        >
                            {modeInfoDialogDetails.bullets.map((bullet) => (
                                <li key={bullet}>
                                    <Typography variant="body2" color="text.secondary">
                                        {bullet}
                                    </Typography>
                                </li>
                            ))}
                        </Box>
                    </DialogContent>
                    <DialogActions sx={{px: 3, py: 2}}>
                        <Button onClick={closeModeInfoDialog} variant="contained">
                            Got it
                        </Button>
                    </DialogActions>
                </Dialog>
            )}
        </>
    );
};

export default ModelConfigForm;

