import React, {forwardRef, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    Box,
    Button,
    CircularProgress,
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
    LLM_GEMINI_API_MODELS,
    LLM_LOCAL_MODELS,
    LLM_MODES,
    LLM_OPENAI_API_MODELS,
    SPEECH_GOOGLE_API_MODELS,
    SPEECH_LOCAL_MODELS,
    SPEECH_MODES,
    SPEECH_OPENAI_API_MODELS
} from '@shared/constants';
import type {LLMMode, LLMModel, TranscribeMode, TranscribeModel} from '@shared/types';
import {
    formatLLMLabel,
    isGeminiApiModel,
    isGoogleTranscribeModel,
    isOpenAiApiModel,
    isOpenAiTranscribeModel
} from '../utils/modelFormatters';
import {
    checkLocalModelDownloaded,
    downloadLocalSpeechModel,
    getLocalSpeechModelMetadata,
    normalizeLocalSpeechModelName,
    subscribeToLocalModelWarmup,
    subscribeToLocalTranscriptions,
    warmupLocalSpeechModel
} from '../services/localSpeechModels';
import {downloadOllamaModel, warmupOllamaModel as warmupOllamaModelService} from '../services/ollama';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import {useLocalSpeechStatus} from '../hooks/useLocalSpeechStatus';
import {useOllamaStatus} from '../hooks/useOllamaStatus';
import ModelApiKeysSection from './ModelApiKeysSection';
import ModelLlmSection from './ModelLlmSection';
import ModelTranscribeSection from './ModelTranscribeSection';

export interface ModelConfigFormData {
    openaiKey: string;
    googleKey: string;
    transcribeMode: TranscribeMode;
    transcribeModel: TranscribeModel;
    llmMode: LLMMode;
    llmModel: LLMModel;
}

const resolveTranscribeOptions = (mode: TranscribeMode, openaiKey: string, googleKey: string): TranscribeModel[] => {
    if (mode === SPEECH_MODES.API) {
        const options: string[] = [];
        // Добавляем OpenAI модели только если есть ключ
        if (openaiKey.trim().length > 0) {
            options.push(...SPEECH_OPENAI_API_MODELS);
        }
        // Добавляем Google модели только если есть ключ
        if (googleKey.trim().length > 0) {
            options.push(...SPEECH_GOOGLE_API_MODELS);
        }
        // Если нет ключей - возвращаем пустой массив (пользователь должен выбрать Local или добавить ключ)
        return options as TranscribeModel[];
    }
    return [...SPEECH_LOCAL_MODELS] as TranscribeModel[];
};

const resolveLlmOptions = (mode: LLMMode, openaiKey: string, googleKey: string): LLMModel[] => {
    if (mode === LLM_MODES.API) {
        const options: string[] = [];
        // Добавляем OpenAI модели только если есть ключ
        if (openaiKey.trim().length > 0) {
            options.push(...LLM_OPENAI_API_MODELS);
        }
        // Добавляем Google модели только если есть ключ
        if (googleKey.trim().length > 0) {
            options.push(...LLM_GEMINI_API_MODELS);
        }
        // Если нет ключей - возвращаем пустой массив (пользователь должен выбрать Local или добавить ключ)
        return options as LLMModel[];
    }
    return [...LLM_LOCAL_MODELS] as LLMModel[];
};

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
    const [localWarmupInProgress, setLocalWarmupInProgress] = useState(false);
    const [localTranscriptionInProgress, setLocalTranscriptionInProgress] = useState(false);
    const checkingRef = useRef<string | null>(null);
    const warmupRequestRef = useRef<string | null>(null);
    const transcribeSelectionByModeRef = useRef<Partial<Record<TranscribeMode, TranscribeModel>>>({
        [values.transcribeMode]: values.transcribeModel
    });
    const llmSelectionByModeRef = useRef<Partial<Record<LLMMode, LLMModel>>>({
        [values.llmMode]: values.llmModel
    });
    const normalizedSpeechModel = useMemo(
        () => normalizeLocalSpeechModelName(values.transcribeModel),
        [values.transcribeModel]
    );
    const transcribeModelOptions = useMemo<TranscribeModel[]>(
        () => resolveTranscribeOptions(values.transcribeMode, values.openaiKey, values.googleKey),
        [values.transcribeMode, values.openaiKey, values.googleKey]
    );
    const llmModelOptions = useMemo<LLMModel[]>(
        () => resolveLlmOptions(values.llmMode, values.openaiKey, values.googleKey),
        [values.llmMode, values.openaiKey, values.googleKey]
    );
    const safeLlmModel = useMemo<LLMModel>(() => {
        if (llmModelOptions.length === 0) {
            // Если нет доступных моделей - возвращаем текущую (будет ошибка, но не сломаем UI)
            return values.llmModel;
        }
        if (llmModelOptions.includes(values.llmModel)) {
            return values.llmModel;
        }
        // Автоматически переключаем на первую доступную модель
        return llmModelOptions[0];
    }, [llmModelOptions, values.llmModel]);
    const {status: localServerStatus} = useLocalSpeechStatus({
        checkHealthOnMount: true,
        pollIntervalMs: 0
    });
    const {
        installed: ollamaInstalled,
        checking: ollamaChecking,
        error: ollamaError,
        modelsLoaded: ollamaModelsLoaded,
        modelChecking: ollamaModelChecking,
        modelDownloaded: ollamaModelDownloaded,
        setModelDownloaded: setOllamaModelDownloaded,
        modelDownloading: ollamaDownloadingModel,
        setModelDownloading: setOllamaDownloadingModel,
        modelWarming: ollamaModelWarming,
        setModelError: setOllamaModelError,
        setError: setOllamaError,
        refreshModels: refreshOllamaModels,
        recheckInstall: recheckOllamaInstall
    } = useOllamaStatus({
        enabled: values.llmMode === LLM_MODES.LOCAL,
        model: safeLlmModel
    });
    const selectedLocalModelMeta = useMemo(
        () => getLocalSpeechModelMetadata(values.transcribeModel),
        [values.transcribeModel]
    );
    const selectedLocalModelDescription = selectedLocalModelMeta
        ? `${selectedLocalModelMeta.label} (${selectedLocalModelMeta.size})`
        : null;

    useEffect(() => {
        transcribeSelectionByModeRef.current[values.transcribeMode] = values.transcribeModel;
    }, [values.transcribeMode, values.transcribeModel]);

    useEffect(() => {
        llmSelectionByModeRef.current[values.llmMode] = values.llmModel;
    }, [values.llmMode, values.llmModel]);

    useEffect(() => {
        const unsubscribe = subscribeToLocalTranscriptions((inProgress) => {
            setLocalTranscriptionInProgress(inProgress);
        });
        return () => {
            unsubscribe();
        };
    }, []);

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
        if (localTranscriptionInProgress) {
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
                const result = await warmupLocalSpeechModel(normalized);
                // Если модель была пропущена из-за занятости, сбрасываем ref чтобы 
                // можно было попробовать снова позже (но не сразу)
                if (result.device === 'busy' && result.compute_type === 'skipped') {
                    // Не сбрасываем сразу - подождем 5 секунд чтобы избежать спама
                    if (!cancelled) {
                        setTimeout(() => {
                            if (warmupRequestRef.current === normalized) {
                                warmupRequestRef.current = null;
                            }
                        }, 5000);
                    }
                }
            } catch (error: any) {
                console.error('[ModelConfigForm] Failed to warmup model', error);
                // Не показываем ошибку для 409 - это нормальная ситуация
                const status = error?.response?.status;
                if (!cancelled && status !== 409) {
                    setLocalModelError('Failed to warm up the model. Please try again later.');
                }
                // Сбрасываем ref с задержкой чтобы избежать бесконечного цикла
                if (!cancelled) {
                    setTimeout(() => {
                        if (warmupRequestRef.current === normalized) {
                            warmupRequestRef.current = null;
                        }
                    }, 5000);
                }
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
        localTranscriptionInProgress,
        localWarmupInProgress
    ]);

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
        const model = safeLlmModel;
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
    }, [values.llmMode, safeLlmModel, ollamaDownloadingModel, refreshOllamaModels]);

    const selectedLocalLLMDescription = useMemo(() => {
        // Не показываем описание если нет доступных моделей (нет ключей)
        if (values.llmMode === LLM_MODES.API && llmModelOptions.length === 0) {
            return null;
        }
        return formatLLMLabel(safeLlmModel);
    }, [safeLlmModel, values.llmMode, llmModelOptions.length]);

    const emitChange = useCallback((partial: Partial<ModelConfigFormData>) => {
        const nextValues = {...values, ...partial};

        // Подхватываем корректную модель сразу при смене режима, чтобы Select не мигал пустым значением.
        if (partial.transcribeMode && partial.transcribeModel === undefined) {
            const options = resolveTranscribeOptions(partial.transcribeMode, partial.openaiKey ?? values.openaiKey, partial.googleKey ?? values.googleKey);
            const currentModel = nextValues.transcribeModel;
            const rememberedModel = transcribeSelectionByModeRef.current[partial.transcribeMode];
            const resolvedModel =
                (rememberedModel && options.includes(rememberedModel)) ? rememberedModel
                    : options.includes(currentModel)
                        ? currentModel
                        : options[0];
            nextValues.transcribeModel = resolvedModel as TranscribeModel;
        }

        if (partial.llmMode && partial.llmModel === undefined) {
            const options = resolveLlmOptions(partial.llmMode, partial.openaiKey ?? values.openaiKey, partial.googleKey ?? values.googleKey);
            const currentModel = nextValues.llmModel;
            const rememberedModel = llmSelectionByModeRef.current[partial.llmMode];
            const resolvedModel =
                (rememberedModel && options.includes(rememberedModel)) ? rememberedModel
                    : options.includes(currentModel)
                        ? currentModel
                        : options[0];
            nextValues.llmModel = resolvedModel as LLMModel;
        }

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
        // Не меняем модель если нет доступных опций (нет ключей) - показываем сообщение
        if (values.transcribeMode === SPEECH_MODES.API && transcribeModelOptions.length === 0) {
            return;
        }
        if (!transcribeModelOptions.includes(values.transcribeModel)) {
            emitChange({transcribeModel: transcribeModelOptions[0] as TranscribeModel});
        }
    }, [transcribeModelOptions, values.transcribeModel, values.transcribeMode, emitChange]);

    useEffect(() => {
        // Не меняем модель если нет доступных опций (нет ключей) - показываем сообщение
        if (values.llmMode === LLM_MODES.API && llmModelOptions.length === 0) {
            return;
        }
        if (values.llmModel !== safeLlmModel) {
            emitChange({llmModel: safeLlmModel});
        }
    }, [values.llmModel, safeLlmModel, values.llmMode, llmModelOptions.length, emitChange]);

    useEffect(() => {
        setOllamaModelError(null);
    }, [safeLlmModel]);

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

    const requiresOpenAIKeyForLLM = values.llmMode === LLM_MODES.API && isOpenAiApiModel(safeLlmModel);
    const requiresGoogleKeyForLLM = values.llmMode === LLM_MODES.API && isGeminiApiModel(safeLlmModel);
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
    const shouldShowOpenAIField =
        values.llmMode === LLM_MODES.API ||
        values.transcribeMode === SPEECH_MODES.API ||
        values.openaiKey.trim().length > 0;
    const shouldShowApiKeysSection =
        values.transcribeMode !== SPEECH_MODES.LOCAL || values.llmMode !== LLM_MODES.LOCAL;
    const isLocalLLMMode = values.llmMode === LLM_MODES.LOCAL;
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
                        <ModelTranscribeSection
                            values={{transcribeMode: values.transcribeMode, transcribeModel: values.transcribeModel}}
                            emitChange={emitChange}
                            disableInputs={disableInputs}
                            transcribeModelOptions={transcribeModelOptions}
                            localServerInstalled={Boolean(localServerStatus?.installed)}
                            localServerRunning={Boolean(localServerStatus?.running)}
                            checkingLocalModel={checkingLocalModel}
                            localModelDownloaded={localModelDownloaded}
                            downloadingLocalModel={downloadingLocalModel}
                            handleDownloadModel={handleDownloadModel}
                            downloadButtonLabel={downloadButtonLabel}
                            localModelError={localModelError}
                            localWarmupInProgress={localWarmupInProgress}
                            warmupWarningMessage={warmupWarningMessage}
                            checkingMessage={checkingMessage}
                            downloadedMessage={downloadedMessage}
                            renderModeInfoButton={renderModeInfoButton}
                        />
                        <div className={'fc gap-1'}>
                            <Box sx={{position: 'relative', width: '100%'}}>
                                <TextField
                                    select
                                    label="LLM Mode"
                                    value={values.llmMode}
                                    onChange={(e) => {
                                        const llmMode = e.target.value as LLMMode;
                                        emitChange({llmMode});
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
                                                        setOllamaModelError(null);
                                                        recheckOllamaInstall();
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

                        <ModelLlmSection
                            values={{llmMode: values.llmMode, llmModel: safeLlmModel}}
                            emitChange={emitChange}
                            disableInputs={disableInputs}
                            isLocalLLMMode={isLocalLLMMode}
                            llmModelOptions={llmModelOptions}
                            ollamaChecking={ollamaChecking}
                            ollamaInstalled={ollamaInstalled}
                            ollamaError={ollamaError}
                            setOllamaError={setOllamaError}
                            refreshOllamaModels={refreshOllamaModels}
                            recheckOllamaInstall={recheckOllamaInstall}
                            ollamaModelsLoaded={ollamaModelsLoaded}
                            ollamaModelChecking={ollamaModelChecking}
                            ollamaModelWarming={ollamaModelWarming}
                            ollamaModelDownloaded={ollamaModelDownloaded}
                            ollamaDownloadingModel={ollamaDownloadingModel}
                            handleDownloadLlmModel={handleDownloadLlmModel}
                            llmCheckingMessage={llmCheckingMessage}
                            llmWarmupWarningMessage={llmWarmupWarningMessage}
                            llmDownloadedMessage={llmDownloadedMessage}
                            llmDownloadButtonLabel={llmDownloadButtonLabel}
                            selectedLocalLLMDescription={selectedLocalLLMDescription}
                        />
                    </Box>
                </Stack>

                {shouldShowApiKeysSection ? (
                    <ModelApiKeysSection
                        values={values}
                        requireApiKeys={requireApiKeys}
                        requiresOpenAIKey={requiresOpenAIKey}
                        requiresGoogleKey={requiresGoogleKey}
                        shouldShowOpenAIField={shouldShowOpenAIField}
                        googleKeyReasons={googleKeyReasons}
                        openaiKeyReasons={openaiKeyReasons}
                        disableInputs={disableInputs}
                        emitChange={emitChange}
                    />
                ) : null}

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
