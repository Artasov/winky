import React, {useEffect, useMemo} from 'react';
import {Box, Button, MenuItem, Stack, TextField, Typography} from '@mui/material';
import {
    LLM_API_MODELS,
    LLM_GEMINI_API_MODELS,
    LLM_LOCAL_MODELS,
    LLM_MODES,
    LLM_OPENAI_API_MODELS,
    SPEECH_API_MODELS,
    SPEECH_LOCAL_MODELS,
    SPEECH_MODES
} from '@shared/constants';
import type {LLMMode, LLMModel, SpeechMode, SpeechModel} from '@shared/types';
import LocalSpeechInstallControl from './LocalSpeechInstallControl';

export interface ModelConfigFormData {
    openaiKey: string;
    googleKey: string;
    geminiKey: string;
    speechMode: SpeechMode;
    speechModel: SpeechModel;
    llmMode: LLMMode;
    llmModel: LLMModel;
}

const getDefaultSpeechModel = (mode: SpeechMode): SpeechModel =>
    (mode === SPEECH_MODES.API ? SPEECH_API_MODELS[0] : SPEECH_LOCAL_MODELS[0]) as SpeechModel;

const getDefaultLLMModel = (mode: LLMMode): LLMModel =>
    (mode === LLM_MODES.API ? LLM_API_MODELS[0] : LLM_LOCAL_MODELS[0]) as LLMModel;

const OPENAI_API_MODEL_SET = new Set<string>([...LLM_OPENAI_API_MODELS]);
const GEMINI_API_MODEL_SET = new Set<string>([...LLM_GEMINI_API_MODELS]);

const isGeminiApiModel = (model: LLMModel): boolean => GEMINI_API_MODEL_SET.has(model as string);
const isOpenAiApiModel = (model: LLMModel): boolean => OPENAI_API_MODEL_SET.has(model as string);

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
            return `Gemini ${base}`;
        }
        if (isOpenAiApiModel(value as LLMModel)) {
            return `OpenAI ${base}`;
        }
        return base;
    };

    const speechModelOptions = useMemo<SpeechModel[]>(() => {
        const base = values.speechMode === SPEECH_MODES.API ? SPEECH_API_MODELS : SPEECH_LOCAL_MODELS;
        return [...base] as SpeechModel[];
    }, [values.speechMode]);

    const llmModelOptions = useMemo<LLMModel[]>(() => {
        if (values.llmMode === LLM_MODES.API) {
            const apiModels: string[] = [...LLM_OPENAI_API_MODELS];
            if (values.geminiKey.trim().length > 0) {
                apiModels.push(...LLM_GEMINI_API_MODELS);
            }
            return apiModels as LLMModel[];
        }
        return [...LLM_LOCAL_MODELS] as LLMModel[];
    }, [values.llmMode, values.geminiKey]);

    const emitChange = (partial: Partial<ModelConfigFormData>) => {
        const nextValues = {...values, ...partial};
        onChange(nextValues);
        if (shouldAutoSave && onAutoSave) {
            void onAutoSave(nextValues);
        }
    };

    useEffect(() => {
        if (!speechModelOptions.includes(values.speechModel)) {
            emitChange({speechModel: speechModelOptions[0] as SpeechModel});
        }
    }, [speechModelOptions, values.speechModel]);

    useEffect(() => {
        if (!llmModelOptions.includes(values.llmModel)) {
            emitChange({llmModel: llmModelOptions[0] as LLMModel});
        }
    }, [llmModelOptions, values.llmModel]);

    const renderSpeechModeSelector = (sx?: any) => (
        <TextField
            select
            label="Speech Recognition"
            value={values.speechMode}
            onChange={(e) => {
                const speechMode = e.target.value as SpeechMode;
                const speechModel = getDefaultSpeechModel(speechMode);
                emitChange({speechMode, speechModel});
            }}
            disabled={saving}
            fullWidth
            sx={sx}
        >
            <MenuItem value={SPEECH_MODES.API}>API</MenuItem>
            <MenuItem value={SPEECH_MODES.LOCAL}>Local</MenuItem>
        </TextField>
    );

    const requiresOpenAIKey = values.llmMode === LLM_MODES.API && isOpenAiApiModel(values.llmModel);
    const requiresGeminiKey = values.llmMode === LLM_MODES.API && isGeminiApiModel(values.llmModel);
    const requiresGoogleKey = values.speechMode === SPEECH_MODES.API;
    const needsAnyApiKey = requireApiKeys && (requiresOpenAIKey || requiresGeminiKey || requiresGoogleKey);

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
                    {values.speechMode === SPEECH_MODES.LOCAL ? (
                        <div className={'fc gap-2'}>
                            {renderSpeechModeSelector({flex: 1})}
                            <LocalSpeechInstallControl disabled={saving}/>
                        </div>
                    ) : (
                        renderSpeechModeSelector()
                    )}
                    <TextField
                        select
                        label="Speech Model"
                        value={values.speechModel}
                        onChange={(e) => emitChange({speechModel: e.target.value as SpeechModel})}
                        disabled={saving}
                    >
                        {speechModelOptions.map((model) => (
                            <MenuItem key={model} value={model}>
                                {formatLabel(model)}
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
                        disabled={saving}
                    >
                        <MenuItem value={LLM_MODES.API}>API</MenuItem>
                        <MenuItem value={LLM_MODES.LOCAL}>Local</MenuItem>
                    </TextField>

                    <TextField
                        select
                        label="LLM Model"
                        value={values.llmModel}
                        onChange={(e) => emitChange({llmModel: e.target.value as LLMModel})}
                        disabled={saving}
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
                        : 'These keys are used for speech recognition (Google) and LLM processing (OpenAI or Gemini). Leave empty if you plan to work in local mode.'}
                </Typography>

                {requiresGoogleKey && (
                    <Stack spacing={0.5}>
                        <TextField
                            id="google-key"
                            type="password"
                            label="Google AI Key"
                            value={values.googleKey}
                            onChange={(e) => emitChange({googleKey: e.target.value})}
                            placeholder="AIza..."
                            required={requireApiKeys && requiresGoogleKey && !requiresOpenAIKey}
                            disabled={saving}
                        />
                        {requireApiKeys && requiresGoogleKey && (
                            <Typography variant="caption" color="text.secondary">
                                Required for API-based speech recognition.
                            </Typography>
                        )}
                    </Stack>
                )}

                {values.llmMode === LLM_MODES.API && (
                    <Stack spacing={0.5}>
                        <TextField
                            id="openai-key"
                            type="password"
                            label="OpenAI API Key"
                            value={values.openaiKey}
                            onChange={(e) => emitChange({openaiKey: e.target.value})}
                            placeholder="sk-..."
                            required={requireApiKeys && requiresOpenAIKey}
                            disabled={saving}
                        />
                        {requireApiKeys && requiresOpenAIKey && (
                            <Typography variant="caption" color="text.secondary">
                                Required for OpenAI GPT models in API mode.
                            </Typography>
                        )}
                    </Stack>
                )}

                {values.llmMode === LLM_MODES.API && (
                    <Stack spacing={0.5}>
                        <TextField
                            id="gemini-key"
                            type="password"
                            label="Google Gemini API Key"
                            value={values.geminiKey}
                            onChange={(e) => emitChange({geminiKey: e.target.value})}
                            placeholder="AIza..."
                            required={requireApiKeys && requiresGeminiKey}
                            disabled={saving}
                        />
                        {requireApiKeys && requiresGeminiKey && (
                            <Typography variant="caption" color="text.secondary">
                                Required for Google Gemini models in API mode.
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
