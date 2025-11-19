import React, {useEffect, useMemo} from 'react';
import {Box, Button, Collapse, MenuItem, Stack, TextField, Typography} from '@mui/material';
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
import type {LLMMode, LLMModel, TranscribeMode, TranscribeModel} from '@shared/types';
import LocalSpeechInstallControl from './LocalSpeechInstallControl';

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

    const emitChange = (partial: Partial<ModelConfigFormData>) => {
        const nextValues = {...values, ...partial};
        onChange(nextValues);
        if (shouldAutoSave && onAutoSave) {
            void onAutoSave(nextValues);
        }
    };

    useEffect(() => {
        if (!transcribeModelOptions.includes(values.transcribeModel)) {
            emitChange({transcribeModel: transcribeModelOptions[0] as TranscribeModel});
        }
    }, [transcribeModelOptions, values.transcribeModel]);

    useEffect(() => {
        if (!llmModelOptions.includes(values.llmModel)) {
            emitChange({llmModel: llmModelOptions[0] as LLMModel});
        }
    }, [llmModelOptions, values.llmModel]);

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
                    <TextField
                        select
                        label="Transcribe Model"
                        value={values.transcribeModel}
                        onChange={(e) => emitChange({transcribeModel: e.target.value as TranscribeModel})}
                        disabled={disableInputs}
                    >
                        {transcribeModelOptions.map((model) => (
                            <MenuItem key={model} value={model}>
                                {formatTranscribeLabel(model)}
                            </MenuItem>
                        ))}
                    </TextField>

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
