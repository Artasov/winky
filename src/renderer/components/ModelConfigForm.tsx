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
import {alpha} from '@mui/material/styles';
import {
    LLM_GEMINI_API_MODELS,
    LLM_LOCAL_MODELS,
    LLM_MODES,
    LLM_OPENAI_API_MODELS,
    LLM_WINKY_API_MODELS,
    SPEECH_GOOGLE_API_MODELS,
    SPEECH_LOCAL_MODELS,
    SPEECH_MODES,
    SPEECH_OPENAI_API_MODELS,
    SPEECH_WINKY_API_MODELS
} from '@shared/constants';
import type {LLMMode, LLMModel, TranscribeMode, TranscribeModel} from '@shared/types';
import {
    formatLLMLabel,
    isGeminiApiModel,
    isGoogleTranscribeModel,
    isOpenAiApiModel,
    isOpenAiTranscribeModel,
    isWinkyLLMModel,
    isWinkyTranscribeModel
} from '../utils/modelFormatters';
import {useUser} from '../context/UserContext';
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
    globalTranscribePrompt: string;
    globalLlmPrompt: string;
}

const resolveTranscribeOptions = (mode: TranscribeMode, openaiKey: string, googleKey: string, isAuthenticated: boolean): TranscribeModel[] => {
    if (mode === SPEECH_MODES.API) {
        const options: string[] = [];
        // Winky модели первыми (если авторизован)
        if (isAuthenticated) {
            options.push(...SPEECH_WINKY_API_MODELS);
        }
        // OpenAI модели только если есть ключ
        if (openaiKey.trim().length > 0) {
            options.push(...SPEECH_OPENAI_API_MODELS);
        }
        // Google модели только если есть ключ
        if (googleKey.trim().length > 0) {
            options.push(...SPEECH_GOOGLE_API_MODELS);
        }
        return options as TranscribeModel[];
    }
    return [...SPEECH_LOCAL_MODELS] as TranscribeModel[];
};

const resolveLlmOptions = (mode: LLMMode, openaiKey: string, googleKey: string, isAuthenticated: boolean): LLMModel[] => {
    if (mode === LLM_MODES.API) {
        const options: string[] = [];
        // Winky модели первыми (если авторизован)
        if (isAuthenticated) {
            options.push(...LLM_WINKY_API_MODELS);
        }
        // OpenAI модели только если есть ключ
        if (openaiKey.trim().length > 0) {
            options.push(...LLM_OPENAI_API_MODELS);
        }
        // Google модели только если есть ключ
        if (googleKey.trim().length > 0) {
            options.push(...LLM_GEMINI_API_MODELS);
        }
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
        title: 'Transcribe Mode',
        description:
            'Choose how your voice is converted to text. In API mode, audio is sent to cloud providers. In Local mode, everything runs on your machine via FastWhisper.',
        bullets: [
            'API mode: Set your OpenAI or Google AI API key below, then select a model (Whisper, Gemini). Charges depend on the provider\'s pricing.',
            'Local mode: Uses the bundled FastWhisper server (~43 MB). Available models: Tiny 75 MB, Base 141 MB, Small 463 MB, Medium 1.42 GB, Large v3 3 GB.',
            'Without an NVIDIA GPU, local models fall back to CPU and run slower. Best results come from an NVIDIA GPU with Large v3.',
            'Get API keys: OpenAI — platform.openai.com/api-keys, Google AI — aistudio.google.com/app/apikey'
        ]
    },
    llm: {
        title: 'LLM Mode',
        description:
            'Choose how your voice input is processed by a large language model. In API mode, requests are sent to cloud providers. In Local mode, everything runs on your machine via Ollama.',
        bullets: [
            'API mode: Set your OpenAI or Google AI API key below, then select a model (GPT-4o, GPT-4o-mini, Gemini 2.0 Flash, etc.). Charges depend on the provider\'s pricing.',
            'Local mode: Install Ollama and download a model. Runs offline with no token costs, but requires a capable GPU for good performance.',
            'The model you pick affects response quality, speed, and cost. Experiment to find the best fit for your workflow.',
            'Get API keys: OpenAI — platform.openai.com/api-keys, Google AI — aistudio.google.com/app/apikey'
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
    const {user} = useUser();
    const isAuthenticated = Boolean(user);
    const shouldAutoSave = autoSave && typeof onAutoSave === 'function';
    const disableInputs = saving && !shouldAutoSave;
    const [modeInfoDialog, setModeInfoDialog] = useState<ModeInfoDialogType | null>(null);
    const [modeInfoDialogContentType, setModeInfoDialogContentType] = useState<ModeInfoDialogType>('transcribe');
    const [localGlobalTranscribePrompt, setLocalGlobalTranscribePrompt] = useState(values.globalTranscribePrompt);
    const [localGlobalLlmPrompt, setLocalGlobalLlmPrompt] = useState(values.globalLlmPrompt);
    const promptDebounceTimerRef = useRef<number | null>(null);

    // РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј Р»РѕРєР°Р»СЊРЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ СЃ props РїСЂРё РёР·РјРµРЅРµРЅРёРё РёР·РІРЅРµ
    useEffect(() => {
        setLocalGlobalTranscribePrompt(values.globalTranscribePrompt);
    }, [values.globalTranscribePrompt]);

    useEffect(() => {
        setLocalGlobalLlmPrompt(values.globalLlmPrompt);
    }, [values.globalLlmPrompt]);

    // РћС‡РёС‰Р°РµРј С‚Р°Р№РјРµСЂ РїСЂРё СЂР°Р·РјРѕРЅС‚РёСЂРѕРІР°РЅРёРё
    useEffect(() => {
        return () => {
            if (promptDebounceTimerRef.current !== null) {
                clearTimeout(promptDebounceTimerRef.current);
            }
        };
    }, []);
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
        () => resolveTranscribeOptions(values.transcribeMode, values.openaiKey, values.googleKey, isAuthenticated),
        [values.transcribeMode, values.openaiKey, values.googleKey, isAuthenticated]
    );
    const llmModelOptions = useMemo<LLMModel[]>(
        () => resolveLlmOptions(values.llmMode, values.openaiKey, values.googleKey, isAuthenticated),
        [values.llmMode, values.openaiKey, values.googleKey, isAuthenticated]
    );
    const safeLlmModel = useMemo<LLMModel>(() => {
        if (llmModelOptions.length === 0) {
            // Р•СЃР»Рё РЅРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РјРѕРґРµР»РµР№ - РІРѕР·РІСЂР°С‰Р°РµРј С‚РµРєСѓС‰СѓСЋ (Р±СѓРґРµС‚ РѕС€РёР±РєР°, РЅРѕ РЅРµ СЃР»РѕРјР°РµРј UI)
            return values.llmModel;
        }
        if (llmModelOptions.includes(values.llmModel)) {
            return values.llmModel;
        }
        // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїРµСЂРµРєР»СЋС‡Р°РµРј РЅР° РїРµСЂРІСѓСЋ РґРѕСЃС‚СѓРїРЅСѓСЋ РјРѕРґРµР»СЊ
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
                // Р•СЃР»Рё РјРѕРґРµР»СЊ Р±С‹Р»Р° РїСЂРѕРїСѓС‰РµРЅР° РёР·-Р·Р° Р·Р°РЅСЏС‚РѕСЃС‚Рё, СЃР±СЂР°СЃС‹РІР°РµРј ref С‡С‚РѕР±С‹ 
                // РјРѕР¶РЅРѕ Р±С‹Р»Рѕ РїРѕРїСЂРѕР±РѕРІР°С‚СЊ СЃРЅРѕРІР° РїРѕР·Р¶Рµ (РЅРѕ РЅРµ СЃСЂР°Р·Сѓ)
                if (result.device === 'busy' && result.compute_type === 'skipped') {
                    // РќРµ СЃР±СЂР°СЃС‹РІР°РµРј СЃСЂР°Р·Сѓ - РїРѕРґРѕР¶РґРµРј 5 СЃРµРєСѓРЅРґ С‡С‚РѕР±С‹ РёР·Р±РµР¶Р°С‚СЊ СЃРїР°РјР°
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
                // РќРµ РїРѕРєР°Р·С‹РІР°РµРј РѕС€РёР±РєСѓ РґР»СЏ 409 - СЌС‚Рѕ РЅРѕСЂРјР°Р»СЊРЅР°СЏ СЃРёС‚СѓР°С†РёСЏ
                const status = error?.response?.status;
                if (!cancelled && status !== 409) {
                    setLocalModelError('Failed to warm up the model. Please try again later.');
                }
                // РЎР±СЂР°СЃС‹РІР°РµРј ref СЃ Р·Р°РґРµСЂР¶РєРѕР№ С‡С‚РѕР±С‹ РёР·Р±РµР¶Р°С‚СЊ Р±РµСЃРєРѕРЅРµС‡РЅРѕРіРѕ С†РёРєР»Р°
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
        }
        setLocalModelError(null);
        setDownloadingLocalModel(true);
        try {
            await downloadLocalSpeechModel(values.transcribeModel);
            const downloaded = await checkLocalModelDownloaded(values.transcribeModel, {force: true});
            setLocalModelDownloaded(downloaded);
            if (metadata) {
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
        // РќРµ РїРѕРєР°Р·С‹РІР°РµРј РѕРїРёСЃР°РЅРёРµ РµСЃР»Рё РЅРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РјРѕРґРµР»РµР№ (РЅРµС‚ РєР»СЋС‡РµР№)
        if (values.llmMode === LLM_MODES.API && llmModelOptions.length === 0) {
            return null;
        }
        return formatLLMLabel(safeLlmModel);
    }, [safeLlmModel, values.llmMode, llmModelOptions.length]);

    const emitChange = useCallback((partial: Partial<ModelConfigFormData>) => {
        const nextValues = {...values, ...partial};

        // Подхватываем корректную модель сразу при смене режима, чтобы Select не мигал пустым значением.
        if (partial.transcribeMode && partial.transcribeModel === undefined) {
            const options = resolveTranscribeOptions(partial.transcribeMode, partial.openaiKey ?? values.openaiKey, partial.googleKey ?? values.googleKey, isAuthenticated);
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
            const options = resolveLlmOptions(partial.llmMode, partial.openaiKey ?? values.openaiKey, partial.googleKey ?? values.googleKey, isAuthenticated);
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

        // Для промптов не вызываем автосохранение сразу - оно будет через дебаунс
        const isPromptChange = 'globalTranscribePrompt' in partial || 'globalLlmPrompt' in partial;
        if (shouldAutoSave && onAutoSave && !isPromptChange) {
            void onAutoSave(nextValues);
        }
    }, [values, onChange, shouldAutoSave, onAutoSave, isAuthenticated]);

    useEffect(() => {
        if (values.transcribeMode !== SPEECH_MODES.LOCAL) {
            return;
        }
        if (selectedLocalModelMeta && selectedLocalModelMeta.id !== values.transcribeModel) {
            emitChange({transcribeModel: selectedLocalModelMeta.id as TranscribeModel});
        }
    }, [values.transcribeMode, values.transcribeModel, selectedLocalModelMeta, emitChange]);

    useEffect(() => {
        // РќРµ РјРµРЅСЏРµРј РјРѕРґРµР»СЊ РµСЃР»Рё РЅРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РѕРїС†РёР№ (РЅРµС‚ РєР»СЋС‡РµР№) - РїРѕРєР°Р·С‹РІР°РµРј СЃРѕРѕР±С‰РµРЅРёРµ
        if (values.transcribeMode === SPEECH_MODES.API && transcribeModelOptions.length === 0) {
            return;
        }
        if (!transcribeModelOptions.includes(values.transcribeModel)) {
            emitChange({transcribeModel: transcribeModelOptions[0] as TranscribeModel});
        }
    }, [transcribeModelOptions, values.transcribeModel, values.transcribeMode, emitChange]);

    useEffect(() => {
        // РќРµ РјРµРЅСЏРµРј РјРѕРґРµР»СЊ РµСЃР»Рё РЅРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РѕРїС†РёР№ (РЅРµС‚ РєР»СЋС‡РµР№) - РїРѕРєР°Р·С‹РІР°РµРј СЃРѕРѕР±С‰РµРЅРёРµ
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
                right: 40,
                top: '50%',
                transform: 'translateY(-50%)',
                borderRadius: '50%',
                width: 28,
                height: 28,
                backgroundColor: 'transparent',
                color: 'var(--color-text-secondary)',
                boxShadow: 'none',
                '&:hover': {
                    color: 'var(--color-text-primary)',
                    backgroundColor: 'transparent',
                    boxShadow: 'none'
                },
                '&:active': {
                    boxShadow: 'none'
                },
                '&.Mui-disabled': {
                    color: 'var(--color-text-tertiary)',
                    boxShadow: 'none'
                },
                '&:focus-visible': {
                    boxShadow: 'none'
                }
            }}
            aria-label={
                type === 'transcribe' ? 'Transcribe mode details' : 'LLM mode details'
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
    const isWinkyLlmSelected = isWinkyLLMModel(safeLlmModel);
    const isWinkyTranscribeSelected = isWinkyTranscribeModel(values.transcribeModel);
    const shouldShowOpenAIField =
        values.llmMode === LLM_MODES.API ||
        values.transcribeMode === SPEECH_MODES.API ||
        values.openaiKey.trim().length > 0;
    // Не показываем секцию ключей если используются только Winky модели или Local режим
    const shouldShowApiKeysSection =
        (values.transcribeMode !== SPEECH_MODES.LOCAL || values.llmMode !== LLM_MODES.LOCAL) &&
        !(isWinkyLlmSelected && isWinkyTranscribeSelected);
    const isLocalLLMMode = values.llmMode === LLM_MODES.LOCAL;
    const checkingMessage = selectedLocalModelDescription
        ? `Checking if ${selectedLocalModelDescription} is availableвЂ¦`
        : 'Checking if the model is availableвЂ¦';
    const downloadedMessage = selectedLocalModelDescription
        ? `${selectedLocalModelDescription} is downloaded and ready to use.`
        : 'The model is downloaded and ready to use.';
    const downloadButtonLabel = selectedLocalModelDescription
        ? downloadingLocalModel
            ? `Downloading ${selectedLocalModelDescription}вЂ¦`
            : `Download ${selectedLocalModelDescription}`
        : downloadingLocalModel
            ? 'DownloadingвЂ¦'
            : 'Download model';
    const warmupWarningMessage = selectedLocalModelDescription
        ? `${selectedLocalModelDescription} is warming up. Using the microphone is temporarily unavailable.`
        : 'The model is warming up. Using the microphone is temporarily unavailable.';
    const llmCheckingMessage = selectedLocalLLMDescription
        ? `Checking if ${selectedLocalLLMDescription} is availableвЂ¦`
        : 'Checking if the model is availableвЂ¦';
    const llmDownloadedMessage = selectedLocalLLMDescription
        ? `${selectedLocalLLMDescription} is downloaded and ready to use.`
        : 'The model is downloaded and ready to use.';
    const llmDownloadButtonLabel = selectedLocalLLMDescription
        ? ollamaDownloadingModel
            ? `Downloading ${selectedLocalLLMDescription}вЂ¦`
            : `Download ${selectedLocalLLMDescription}`
        : ollamaDownloadingModel
            ? 'DownloadingвЂ¦'
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
                sx={(theme) => {
                    const isDark = theme.palette.mode === 'dark';
                    const darkSurface = alpha('#6f6f6f', 0.3);
                    return {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        borderRadius: 4,
                        border: isDark ? `1px solid ${darkSurface}` : '1px solid var(--color-border-light)',
                        backgroundColor: isDark ? theme.palette.background.default : 'var(--color-bg-elevated)',
                        p: {xs: 3, md: 4},
                        boxShadow: isDark ? 'none' : 'var(--shadow-primary-sm)'
                    };
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
                                            Checking Ollama installation and model availabilityвЂ¦
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

                <div className={'fc gap-2'}>
                    <Typography variant="h6" color="text.primary" fontWeight={600}>
                        Global Prompts
                    </Typography>
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        These prompts will be automatically added to all your actions.
                    </Typography>
                    <TextField
                        label="Global Transcribe Prompt"
                        value={localGlobalTranscribePrompt}
                        onChange={(e) => {
                            const newValue = e.target.value;
                            setLocalGlobalTranscribePrompt(newValue);

                            if (promptDebounceTimerRef.current !== null) {
                                clearTimeout(promptDebounceTimerRef.current);
                            }

                            promptDebounceTimerRef.current = window.setTimeout(() => {
                                emitChange({globalTranscribePrompt: newValue});
                                if (shouldAutoSave && onAutoSave) {
                                    void onAutoSave({...values, globalTranscribePrompt: newValue});
                                }
                            }, 800);
                        }}
                        disabled={disableInputs}
                        multiline
                        rows={3}
                        placeholder="Global instructions for speech recognition..."
                        fullWidth
                    />
                    <TextField
                        label="Global LLM Prompt"
                        value={localGlobalLlmPrompt}
                        onChange={(e) => {
                            const newValue = e.target.value;
                            setLocalGlobalLlmPrompt(newValue);

                            if (promptDebounceTimerRef.current !== null) {
                                clearTimeout(promptDebounceTimerRef.current);
                            }

                            promptDebounceTimerRef.current = window.setTimeout(() => {
                                emitChange({globalLlmPrompt: newValue});
                                if (shouldAutoSave && onAutoSave) {
                                    void onAutoSave({...values, globalLlmPrompt: newValue});
                                }
                            }, 800);
                        }}
                        disabled={disableInputs}
                        multiline
                        rows={3}
                        placeholder="Global instructions for LLM processing..."
                        fullWidth
                    />
                </div>

                {!shouldAutoSave && onSubmit && (
                    <Box display="flex" justifyContent="flex-end" mt={2}>
                        <Button type="submit" variant="contained" size="large" disabled={saving} sx={{px: 4}}>
                            {saving ? 'SavingвЂ¦' : submitButtonText}
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



