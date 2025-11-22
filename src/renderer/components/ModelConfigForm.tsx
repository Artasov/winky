import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Button, CircularProgress, Collapse, MenuItem, Stack, TextField, Typography} from '@mui/material';
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
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

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
    const [localModelDownloaded, setLocalModelDownloaded] = useState<boolean | null>(null);
    const [localModelVerifiedFor, setLocalModelVerifiedFor] = useState<string | null>(null);
    const [checkingLocalModel, setCheckingLocalModel] = useState(false);
    const [downloadingLocalModel, setDownloadingLocalModel] = useState(false);
    const [localModelError, setLocalModelError] = useState<string | null>(null);
    const [localServerStatus, setLocalServerStatus] = useState<FastWhisperStatus | null>(null);
    const [localWarmupInProgress, setLocalWarmupInProgress] = useState(false);
    const checkingRef = useRef<string | null>(null);
    const warmupRequestRef = useRef<string | null>(null);
    const normalizedSelectedModel = useMemo(
        () => normalizeLocalSpeechModelName(values.transcribeModel),
        [values.transcribeModel]
    );
    const selectedLocalModelMeta = useMemo(
        () => getLocalSpeechModelMetadata(normalizedSelectedModel),
        [normalizedSelectedModel]
    );
    const selectedLocalModelDescription = selectedLocalModelMeta
        ? `${selectedLocalModelMeta.label} (${selectedLocalModelMeta.size})`
        : null;

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
        if (!normalizedSelectedModel) {
            setLocalWarmupInProgress(false);
            warmupRequestRef.current = null;
            return;
        }
        const unsubscribe = subscribeToLocalModelWarmup((activeModels) => {
            setLocalWarmupInProgress(activeModels.has(normalizedSelectedModel));
        });
        return () => {
            unsubscribe();
        };
    }, [values.transcribeMode, normalizedSelectedModel]);

    useEffect(() => {
        const normalized = normalizedSelectedModel;

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
        normalizedSelectedModel,
        localServerStatus?.installed,
        localServerStatus?.running
    ]);

    useEffect(() => {
        const normalized = normalizedSelectedModel;
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
        normalizedSelectedModel,
        localServerStatus?.installed,
        localServerStatus?.running,
        localModelDownloaded,
        localModelVerifiedFor,
        checkingLocalModel,
        downloadingLocalModel,
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
        return base;
    };

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

    const renderTranscribeModeSelector = (sx?: any) => (
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
        >
            <MenuItem value={SPEECH_MODES.API}>API</MenuItem>
            <MenuItem value={SPEECH_MODES.LOCAL}>Local</MenuItem>
        </TextField>
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

    return (
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
                    >
                        <MenuItem value={LLM_MODES.API}>API</MenuItem>
                        <MenuItem value={LLM_MODES.LOCAL}>Local</MenuItem>
                    </TextField>

                    <TextField
                        select
                        label="LLM Model"
                        value={values.llmModel}
                        onChange={(e) => emitChange({llmModel: e.target.value as LLMModel})}
                        disabled={disableInputs}
                    >
                        {llmModelOptions.map((model) => (
                            <MenuItem key={model} value={model}>
                                {formatLLMLabel(model)}
                            </MenuItem>
                        ))}
                    </TextField>
                </Box>
            </Stack>

            <Stack spacing={2}>
                <Typography variant="h6" color="text.primary" fontWeight={600}>
                    API Keys
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {needsAnyApiKey
                        ? 'Provide the API keys required for the selected providers below.'
                        : 'These keys are used for API-based speech recognition and LLM processing (OpenAI or Google Gemini). Leave empty if you plan to work in local mode.'}
                </Typography>

                <Stack spacing={0.5}>
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
                </Stack>

                {shouldShowOpenAIField && (
                    <Stack spacing={0.5}>
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
                    </Stack>
                )}

                {!requiresGoogleKey && !requiresOpenAIKey && (
                    <Typography variant="body2" color="text.secondary" fontStyle="italic">
                        No API keys required for local mode.
                    </Typography>
                )}
            </Stack>

            {!shouldAutoSave && onSubmit && (
                <Box display="flex" justifyContent="flex-end" mt={2}>
                    <Button type="submit" variant="contained" size="large" disabled={saving} sx={{px: 4}}>
                        {saving ? 'Saving…' : submitButtonText}
                    </Button>
                </Box>
            )}
        </Box>
    );
};

export default ModelConfigForm;
