import React, {useEffect} from 'react';
import {Box, Button, CircularProgress, MenuItem, TextField, Typography} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type {LLMMode, LLMModel} from '@shared/types';
import {formatLLMLabel} from '../utils/modelFormatters';

type ModelLlmSectionProps = {
    values: {
        llmMode: LLMMode;
        llmModel: LLMModel;
    };
    emitChange: (partial: Partial<{ llmMode: LLMMode; llmModel: LLMModel }>) => void;
    disableInputs: boolean;
    isLocalLLMMode: boolean;
    llmModelOptions: LLMModel[];
    ollamaChecking: boolean;
    ollamaInstalled: boolean | null;
    ollamaError: string | null;
    setOllamaError: (value: string | null) => void;
    refreshOllamaModels: (force?: boolean, maxAttempts?: number, attemptInterval?: number) => Promise<string[]>;
    recheckOllamaInstall: () => void;
    ollamaModelsLoaded: boolean;
    ollamaModelChecking: boolean;
    ollamaModelWarming: boolean;
    ollamaModelDownloaded: boolean | null;
    ollamaDownloadingModel: boolean;
    handleDownloadLlmModel: () => void;
    llmCheckingMessage: string;
    llmWarmupWarningMessage: string;
    llmDownloadedMessage: string;
    llmDownloadButtonLabel: string;
};

export const ModelLlmSection: React.FC<ModelLlmSectionProps> = ({
                                                                    values,
                                                                    emitChange,
                                                                    disableInputs,
                                                                    isLocalLLMMode,
                                                                    llmModelOptions,
                                                                    ollamaChecking,
                                                                    ollamaInstalled,
                                                                    ollamaError,
                                                                    setOllamaError,
    refreshOllamaModels,
                                                                    recheckOllamaInstall,
                                                                    ollamaModelsLoaded,
                                                                    ollamaModelChecking,
                                                                    ollamaModelWarming,
                                                                    ollamaModelDownloaded,
                                                                    ollamaDownloadingModel,
                                                                    handleDownloadLlmModel,
                                                                    llmCheckingMessage,
                                                                    llmWarmupWarningMessage,
                                                                    llmDownloadedMessage,
    llmDownloadButtonLabel
                                                                  }) => {
    const disableLlmModelSelect = disableInputs || (isLocalLLMMode && (ollamaChecking || !ollamaInstalled));

    useEffect(() => {
        if (isLocalLLMMode && !ollamaModelsLoaded && !ollamaModelChecking) {
            void refreshOllamaModels();
        }
    }, [isLocalLLMMode, ollamaModelsLoaded, ollamaModelChecking, refreshOllamaModels]);

    const isApiMode = !isLocalLLMMode;
    const hasNoApiModels = isApiMode && llmModelOptions.length === 0;

    return (
        <>
            <div className={'fc gap-1'}>
                {hasNoApiModels ? (
                    <Typography variant="body2" color="text.secondary" sx={{fontStyle: 'italic', py: 1}}>
                        No API keys configured. Add a key below or switch to Local mode.
                    </Typography>
                ) : (
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
                )}
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
                    </Box>
                )}
                {ollamaError && (
                    <Typography variant="body2" color="error" sx={{mt: 0.5}}>
                        {ollamaError}
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
                                    recheckOllamaInstall();
                                }}
                                sx={{flexShrink: 0}}
                            >
                                Refresh
                            </Button>
                        )}
                    </Box>
                )}
            </div>
        </>
    );
};

export default ModelLlmSection;
