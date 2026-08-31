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
import type {BackendDomain, LLMMode, LLMModel, TranscribeMode, TranscribeModel} from '@shared/types';
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
    warmupLocalSpeechModel
} from '../services/localSpeechModels';
import {downloadOllamaModel, warmupOllamaModel as warmupOllamaModelService} from '../services/ollama';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import {useLocalSpeechModelStatus, useLocalSpeechStatus} from '../hooks/useLocalSpeechStatus';
import {useOllamaStatus} from '../hooks/useOllamaStatus';
import ModelApiKeysSection from './ModelApiKeysSection';
import ModelLlmSection from './ModelLlmSection';
import ModelTranscribeSection from './ModelTranscribeSection';
import {
    type WinkyTranscriptionCatalog,
    winkyTranscriptionCatalogService
} from '../services/WinkyTranscriptionCatalogService';

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

const resolveTranscribeOptions = (
    mode: TranscribeMode,
    winkyCatalog: WinkyTranscriptionCatalog | null
): TranscribeModel[] => {
    if (mode === SPEECH_MODES.API) {
        const winkyModels = winkyCatalog
            ? winkyCatalog.options.map((option) => `winky-transcribe-${option.level}` as TranscribeModel)
            : [...SPEECH_WINKY_API_MODELS];
        return [
            ...winkyModels,
            ...SPEECH_OPENAI_API_MODELS,
            ...SPEECH_GOOGLE_API_MODELS
        ];
    }
    return [...SPEECH_LOCAL_MODELS];
};

const resolveLlmOptions = (mode: LLMMode): LLMModel[] => {
    if (mode === LLM_MODES.API) {
        return [
            ...LLM_WINKY_API_MODELS,
            ...LLM_OPENAI_API_MODELS,
            ...LLM_GEMINI_API_MODELS
        ];
    }
    return [...LLM_LOCAL_MODELS];
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
            'API mode: Set your OpenAI or Google AI API key below, then select a current GPT or Gemini model. Charges depend on the provider\'s pricing.',
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
    backendDomain?: BackendDomain;
}

const ModelConfigForm: React.FC<ModelConfigFormProps> = ({
                                                             values,
                                                             onChange,
                                                             saving,
                                                             requireApiKeys = false,
                                                             autoSave = false,
                                                             onAutoSave,
                                                             onSubmit,
                                                             submitButtonText = 'Save',
                                                             backendDomain
                                                         }) => {
    const shouldAutoSave = autoSave && typeof onAutoSave === 'function';
    const disableInputs = saving && !shouldAutoSave;
    const [modeInfoDialog, setModeInfoDialog] = useState<ModeInfoDialogType | null>(null);
    const [modeInfoDialogContentType, setModeInfoDialogContentType] = useState<ModeInfoDialogType>('transcribe');
    const [localGlobalTranscribePrompt, setLocalGlobalTranscribePrompt] = useState(values.globalTranscribePrompt);
    const [localGlobalLlmPrompt, setLocalGlobalLlmPrompt] = useState(values.globalLlmPrompt);
    const [winkyCatalog, setWinkyCatalog] = useState<WinkyTranscriptionCatalog | null>(null);
    const [winkyCatalogError, setWinkyCatalogError] = useState<string | null>(null);

    // Keep local prompt state in sync when parent props change.
    useEffect(() => {
        setLocalGlobalTranscribePrompt(values.globalTranscribePrompt);
    }, [values.globalTranscribePrompt]);

    useEffect(() => {
        setLocalGlobalLlmPrompt(values.globalLlmPrompt);
    }, [values.globalLlmPrompt]);

    useEffect(() => {
        let stopped = false;
        setWinkyCatalog(null);
        setWinkyCatalogError(null);
        void winkyTranscriptionCatalogService.get(true)
            .then((catalog) => {
                if (stopped) return;
                setWinkyCatalog(catalog);
                setWinkyCatalogError(null);
            })
            .catch(() => {
                if (!stopped) {
                    setWinkyCatalogError('Live Winky pricing is temporarily unavailable; saved model choices remain usable.');
                }
            });
        return () => {
            stopped = true;
        };
    }, [backendDomain]);

    const transcribeSelectionByModeRef = useRef<Partial<Record<TranscribeMode, TranscribeModel>>>({
        [values.transcribeMode]: values.transcribeModel
    });
    const llmSelectionByModeRef = useRef<Partial<Record<LLMMode, LLMModel>>>({
        [values.llmMode]: values.llmModel
    });
    const transcribeModelOptions = useMemo<TranscribeModel[]>(
        () => resolveTranscribeOptions(values.transcribeMode, winkyCatalog),
        [values.transcribeMode, winkyCatalog]
    );
    const safeTranscribeModel = transcribeModelOptions.includes(values.transcribeModel)
        ? values.transcribeModel
        : transcribeModelOptions[0] ?? values.transcribeModel;
    const normalizedSpeechModel = useMemo(
        () => normalizeLocalSpeechModelName(safeTranscribeModel),
        [safeTranscribeModel]
    );
    const winkyTranscribeLabels = useMemo<Record<string, string>>(() => {
        if (!winkyCatalog) return {};
        return Object.fromEntries(winkyCatalog.options.map((option) => [
            `winky-transcribe-${option.level}`,
            `Winky ${option.name} · ${option.credits_per_minute} credits/min`
        ]));
    }, [winkyCatalog]);
    const llmModelOptions = useMemo<LLMModel[]>(
        () => resolveLlmOptions(values.llmMode),
        [values.llmMode]
    );
    const safeLlmModel = useMemo<LLMModel>(() => {
        if (llmModelOptions.includes(values.llmModel)) return values.llmModel;
        return llmModelOptions[0] ?? values.llmModel;
    }, [llmModelOptions, values.llmModel]);
    const {
        status: localServerStatus,
        error: localServerError,
        loading: localServerLoading,
        operation: localServerOperation,
        transcriptionInProgress: localTranscriptionInProgress
    } = useLocalSpeechStatus({
        checkHealthOnMount: true,
        pollIntervalMs: 0
    });
    const localModelStatus = useLocalSpeechModelStatus(normalizedSpeechModel);
    const checkingLocalModel = localModelStatus.phase === 'unknown' || localModelStatus.phase === 'checking';
    const downloadingLocalModel = localModelStatus.phase === 'downloading';
    const localWarmupInProgress = localModelStatus.phase === 'warming';
    const localModelDownloaded = localModelStatus.downloaded;
    const localModelError = localModelStatus.error ?? null;
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
        () => getLocalSpeechModelMetadata(safeTranscribeModel),
        [safeTranscribeModel]
    );
    const selectedLocalModelDescription = selectedLocalModelMeta
        ? `${selectedLocalModelMeta.label} (${selectedLocalModelMeta.size})`
        : null;

    useEffect(() => {
        if (transcribeModelOptions.includes(values.transcribeModel)) {
            transcribeSelectionByModeRef.current[values.transcribeMode] = values.transcribeModel;
        }
    }, [values.transcribeMode, values.transcribeModel, transcribeModelOptions]);

    useEffect(() => {
        if (llmModelOptions.includes(values.llmModel)) {
            llmSelectionByModeRef.current[values.llmMode] = values.llmModel;
        }
    }, [values.llmMode, values.llmModel, llmModelOptions]);

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
        const normalized = normalizedSpeechModel;
        if (values.transcribeMode !== SPEECH_MODES.LOCAL || !normalized || !localServerStatus?.installed) return;
        void checkLocalModelDownloaded(normalized, {force: true});
    }, [
        values.transcribeMode,
        normalizedSpeechModel,
        localServerStatus?.installed,
        localServerStatus?.running
    ]);

    useEffect(() => {
        const normalized = normalizedSpeechModel;
        const canWarmup = values.transcribeMode === SPEECH_MODES.LOCAL
            && Boolean(normalized)
            && Boolean(localServerStatus?.running)
            && localModelStatus.phase === 'installed'
            && localModelStatus.downloaded === true
            && !localTranscriptionInProgress;
        if (!canWarmup) return;
        void warmupLocalSpeechModel(normalized).catch(() => undefined);
    }, [
        values.transcribeMode,
        normalizedSpeechModel,
        localServerStatus?.running,
        localModelStatus.phase,
        localModelStatus.downloaded,
        localTranscriptionInProgress,
    ]);

    const handleDownloadModel = useCallback(async () => {
        if (values.transcribeMode !== SPEECH_MODES.LOCAL || downloadingLocalModel) {
            return;
        }
        try {
            await downloadLocalSpeechModel(safeTranscribeModel);
            await warmupLocalSpeechModel(safeTranscribeModel);
        } catch {
            // The shared local speech state exposes the actionable error to every window.
        }
    }, [downloadingLocalModel, values.transcribeMode, safeTranscribeModel]);

    const handleWarmupModel = useCallback(async () => {
        if (!localServerStatus?.running || localModelStatus.downloaded !== true) return;
        try {
            await warmupLocalSpeechModel(safeTranscribeModel);
        } catch {
            // The shared local speech state exposes the actionable error to every window.
        }
    }, [localServerStatus?.running, localModelStatus.downloaded, safeTranscribeModel]);

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
        // Hide the helper text when no models are available yet.
        if (values.llmMode === LLM_MODES.API && llmModelOptions.length === 0) {
            return null;
        }
        return formatLLMLabel(safeLlmModel);
    }, [safeLlmModel, values.llmMode, llmModelOptions.length]);

    const emitChange = useCallback((partial: Partial<ModelConfigFormData>) => {
        const nextValues = {...values, ...partial};

        // Подхватываем корректную модель сразу при смене режима, чтобы Select не мигал пустым значением.
        if (partial.transcribeMode && partial.transcribeModel === undefined) {
            const options = resolveTranscribeOptions(partial.transcribeMode, winkyCatalog);
            const currentModel = nextValues.transcribeModel;
            const rememberedModel = transcribeSelectionByModeRef.current[partial.transcribeMode];
            const resolvedModel =
                (rememberedModel && options.includes(rememberedModel)) ? rememberedModel
                    : options.includes(currentModel)
                        ? currentModel
                        : options[0] ?? currentModel;
            nextValues.transcribeModel = resolvedModel;
        }

        if (partial.llmMode && partial.llmModel === undefined) {
            const options = resolveLlmOptions(partial.llmMode);
            const currentModel = nextValues.llmModel;
            const rememberedModel = llmSelectionByModeRef.current[partial.llmMode];
            const resolvedModel =
                (rememberedModel && options.includes(rememberedModel)) ? rememberedModel
                    : options.includes(currentModel)
                        ? currentModel
                        : options[0] ?? currentModel;
            nextValues.llmModel = resolvedModel;
        }

        onChange(nextValues);

        if (shouldAutoSave && onAutoSave) void onAutoSave(nextValues);
    }, [values, onChange, shouldAutoSave, onAutoSave, winkyCatalog]);

    const emitPromptChange = useCallback((partial: Pick<Partial<ModelConfigFormData>, 'globalTranscribePrompt' | 'globalLlmPrompt'>) => {
        emitChange(partial);
    }, [emitChange]);

    useEffect(() => {
        const partial: Partial<ModelConfigFormData> = {};
        if (safeTranscribeModel && safeTranscribeModel !== values.transcribeModel) {
            partial.transcribeModel = safeTranscribeModel;
        }
        if (safeLlmModel && safeLlmModel !== values.llmModel) {
            partial.llmModel = safeLlmModel;
        }
        if (Object.keys(partial).length > 0) emitChange(partial);
    }, [emitChange, safeLlmModel, safeTranscribeModel, values.llmModel, values.transcribeModel]);

    useEffect(() => {
        if (values.transcribeMode !== SPEECH_MODES.LOCAL) {
            return;
        }
        if (selectedLocalModelMeta && selectedLocalModelMeta.id !== values.transcribeModel) {
            emitChange({transcribeModel: selectedLocalModelMeta.id as TranscribeModel});
        }
    }, [values.transcribeMode, values.transcribeModel, selectedLocalModelMeta, emitChange]);

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
        values.transcribeMode === SPEECH_MODES.API && isOpenAiTranscribeModel(safeTranscribeModel);
    const requiresGoogleKeyForTranscribe =
        values.transcribeMode === SPEECH_MODES.API && isGoogleTranscribeModel(safeTranscribeModel);
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
    const isLocalLLMMode = values.llmMode === LLM_MODES.LOCAL;
    const checkingMessage = selectedLocalModelDescription
        ? `Checking if ${selectedLocalModelDescription} is available...`
        : 'Checking if the model is available...';
    const downloadedMessage = selectedLocalModelDescription
        ? `${selectedLocalModelDescription} is downloaded and ready to use.`
        : 'The model is downloaded and ready to use.';
    const downloadButtonLabel = selectedLocalModelDescription
        ? downloadingLocalModel
            ? `Downloading ${selectedLocalModelDescription}...`
            : `Download ${selectedLocalModelDescription}`
        : downloadingLocalModel
            ? 'Downloading...'
            : 'Download model';
    const warmupWarningMessage = selectedLocalModelDescription
        ? `${selectedLocalModelDescription} is warming up. Using the microphone is temporarily unavailable.`
        : 'The model is warming up. Using the microphone is temporarily unavailable.';
    const llmCheckingMessage = selectedLocalLLMDescription
        ? `Checking if ${selectedLocalLLMDescription} is available...`
        : 'Checking if the model is available...';
    const llmDownloadedMessage = selectedLocalLLMDescription
        ? `${selectedLocalLLMDescription} is downloaded and ready to use.`
        : 'The model is downloaded and ready to use.';
    const llmDownloadButtonLabel = selectedLocalLLMDescription
        ? ollamaDownloadingModel
            ? `Downloading ${selectedLocalLLMDescription}...`
            : `Download ${selectedLocalLLMDescription}`
        : ollamaDownloadingModel
            ? 'Downloading...'
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
                            values={{transcribeMode: values.transcribeMode, transcribeModel: safeTranscribeModel}}
                            emitChange={emitChange}
                            disableInputs={disableInputs}
                            transcribeModelOptions={transcribeModelOptions}
                            transcribeModelLabels={winkyTranscribeLabels}
                            currentModelUnavailable={!transcribeModelOptions.includes(values.transcribeModel)}
                            winkyCatalogLabel={winkyCatalog?.group_label ?? null}
                            winkyCatalogError={winkyCatalogError}
                            localServerInstalled={Boolean(localServerStatus?.installed)}
                            localServerRunning={Boolean(localServerStatus?.running)}
                            localServerLoading={localServerLoading || localServerOperation !== null}
                            localServerError={localServerError}
                            localModelPhase={localModelStatus.phase}
                            checkingLocalModel={checkingLocalModel}
                            localModelDownloaded={localModelDownloaded}
                            downloadingLocalModel={downloadingLocalModel}
                            handleDownloadModel={handleDownloadModel}
                            handleWarmupModel={handleWarmupModel}
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
                                            Checking Ollama installation and model availability...
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
                            currentModelUnavailable={!llmModelOptions.includes(values.llmModel)}
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

                <ModelApiKeysSection
                    values={values}
                    requireApiKeys={requireApiKeys}
                    requiresOpenAIKey={requiresOpenAIKey}
                    requiresGoogleKey={requiresGoogleKey}
                    googleKeyReasons={googleKeyReasons}
                    openaiKeyReasons={openaiKeyReasons}
                    disableInputs={disableInputs}
                    emitChange={emitChange}
                />

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

                            emitPromptChange({globalTranscribePrompt: newValue});
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

                            emitPromptChange({globalLlmPrompt: newValue});
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
                            {saving ? 'Saving...' : submitButtonText}
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



