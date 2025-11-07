import React, {useEffect, useMemo} from 'react';
import {Box, MenuItem, Stack, TextField, Typography} from '@mui/material';
import {
    LLM_API_MODELS,
    LLM_LOCAL_MODELS,
    LLM_MODES,
    SPEECH_API_MODELS,
    SPEECH_LOCAL_MODELS,
    SPEECH_MODES
} from '@shared/constants';
import type {LLMMode, LLMModel, SpeechMode, SpeechModel} from '@shared/types';

export interface ModelConfigFormData {
    openaiKey: string;
    googleKey: string;
    speechMode: SpeechMode;
    speechModel: SpeechModel;
    llmMode: LLMMode;
    llmModel: LLMModel;
}

interface ModelConfigFormProps {
    values: ModelConfigFormData;
    onChange: (values: ModelConfigFormData) => void;
    onSave: (partial: Partial<ModelConfigFormData>) => Promise<void>;
    saving: boolean;
    requireApiKeys?: boolean;
}

const ModelConfigForm: React.FC<ModelConfigFormProps> = ({
                                                             values,
                                                             onChange,
                                                             onSave,
                                                             saving,
                                                             requireApiKeys = false
                                                         }) => {
    const formatLabel = (value: string) =>
        value
            .replace(/[:]/g, ' ')
            .replace(/-/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');

    const speechModelOptions = useMemo<SpeechModel[]>(() => {
        const base = values.speechMode === SPEECH_MODES.API ? SPEECH_API_MODELS : SPEECH_LOCAL_MODELS;
        return [...base] as SpeechModel[];
    }, [values.speechMode]);

    const llmModelOptions = useMemo<LLMModel[]>(() => {
        const base = values.llmMode === LLM_MODES.API ? LLM_API_MODELS : LLM_LOCAL_MODELS;
        return [...base] as LLMModel[];
    }, [values.llmMode]);

    useEffect(() => {
        if (!speechModelOptions.includes(values.speechModel)) {
            onChange({
                ...values,
                speechModel: speechModelOptions[0] as SpeechModel
            });
        }
    }, [speechModelOptions, values.speechModel]);

    useEffect(() => {
        if (!llmModelOptions.includes(values.llmModel)) {
            onChange({
                ...values,
                llmModel: llmModelOptions[0] as LLMModel
            });
        }
    }, [llmModelOptions, values.llmModel]);

    const requiresOpenAIKey = values.llmMode === LLM_MODES.API;
    const requiresGoogleKey = values.speechMode === SPEECH_MODES.API;

    return (
        <Box
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
                    <TextField
                        select
                        label="Speech Recognition"
                        value={values.speechMode}
                        onChange={(e) => {
                            const next = {...values, speechMode: e.target.value as SpeechMode};
                            onChange(next);
                            void onSave({speechMode: next.speechMode, speechModel: next.speechModel});
                        }}
                        disabled={saving}
                    >
                        <MenuItem value={SPEECH_MODES.API}>API</MenuItem>
                        <MenuItem value={SPEECH_MODES.LOCAL}>Local</MenuItem>
                    </TextField>

                    <TextField
                        select
                        label="Speech Model"
                        value={values.speechModel}
                        onChange={(e) => {
                            const next = {...values, speechModel: e.target.value as SpeechModel};
                            onChange(next);
                            void onSave({speechModel: next.speechModel});
                        }}
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
                            const next = {...values, llmMode: e.target.value as LLMMode};
                            onChange(next);
                            void onSave({llmMode: next.llmMode, llmModel: next.llmModel});
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
                        onChange={(e) => {
                            const next = {...values, llmModel: e.target.value as LLMModel};
                            onChange(next);
                            void onSave({llmModel: next.llmModel});
                        }}
                        disabled={saving}
                    >
                        {llmModelOptions.map((model) => (
                            <MenuItem key={model} value={model}>
                                {formatLabel(model)}
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
                    {requireApiKeys && (requiresOpenAIKey || requiresGoogleKey)
                        ? 'Please provide at least one API key for the selected mode(s).'
                        : 'These keys are used for speech recognition (Google) and LLM processing (OpenAI). Leave empty if you plan to work in local mode.'}
                </Typography>

                {requiresGoogleKey && (
                    <Stack spacing={0.5}>
                        <TextField
                            id="google-key"
                            type="password"
                            label="Google AI Key"
                            value={values.googleKey}
                            onChange={(e) => {
                                const next = {...values, googleKey: e.target.value};
                                onChange(next);
                                void onSave({googleKey: next.googleKey});
                            }}
                            placeholder="AIza..."
                            required={requireApiKeys && requiresGoogleKey && !requiresOpenAIKey}
                            disabled={saving}
                        />
                        {requireApiKeys && requiresOpenAIKey && (
                            <Typography variant="caption" color="text.secondary">
                                Required for API-based speech recognition. Can be skipped if OpenAI key is provided.
                            </Typography>
                        )}
                    </Stack>
                )}

                {requiresOpenAIKey && (
                    <Stack spacing={0.5}>
                        <TextField
                            id="openai-key"
                            type="password"
                            label="OpenAI API Key"
                            value={values.openaiKey}
                            onChange={(e) => {
                                const next = {...values, openaiKey: e.target.value};
                                onChange(next);
                                void onSave({openaiKey: next.openaiKey});
                            }}
                            placeholder="sk-..."
                            required={requireApiKeys && requiresOpenAIKey && !requiresGoogleKey}
                            disabled={saving}
                        />
                        {requireApiKeys && requiresGoogleKey && (
                            <Typography variant="caption" color="text.secondary">
                                Required for API-based LLM processing. Can be skipped if Google key is provided.
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

        </Box>
    );
};

export default ModelConfigForm;
