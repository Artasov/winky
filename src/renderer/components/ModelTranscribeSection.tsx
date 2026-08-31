import React from 'react';
import {Box, Button, CircularProgress, Collapse, MenuItem, TextField, Typography} from '@mui/material';
import type {TranscribeMode, TranscribeModel} from '@shared/types';
import {SPEECH_MODES} from '@shared/constants';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalSpeechInstallControl from './LocalSpeechInstallControl';
import {formatTranscribeLabel} from '../utils/modelFormatters';
import type {LocalSpeechModelPhase} from '../services/localSpeechModels';

type ModelTranscribeSectionProps = {
    values: {
        transcribeMode: TranscribeMode;
        transcribeModel: TranscribeModel;
    };
    emitChange: (partial: Partial<{transcribeMode: TranscribeMode; transcribeModel: TranscribeModel}>) => void;
    disableInputs: boolean;
    transcribeModelOptions: TranscribeModel[];
    transcribeModelLabels: Record<string, string>;
    currentModelUnavailable: boolean;
    winkyCatalogLabel: string | null;
    winkyCatalogError: string | null;
    localServerInstalled: boolean;
    localServerRunning: boolean;
    localServerLoading: boolean;
    localServerError: string | null;
    localModelPhase: LocalSpeechModelPhase;
    checkingLocalModel: boolean;
    localModelDownloaded: boolean | null;
    downloadingLocalModel: boolean;
    handleDownloadModel: () => void;
    handleWarmupModel: () => void;
    downloadButtonLabel: string;
    localModelError: string | null;
    localWarmupInProgress: boolean;
    warmupWarningMessage: string;
    checkingMessage: string;
    downloadedMessage: string;
    renderModeInfoButton: (type: 'transcribe', disabled: boolean) => React.ReactNode;
};

export const ModelTranscribeSection: React.FC<ModelTranscribeSectionProps> = ({
    values,
    emitChange,
    disableInputs,
    transcribeModelOptions,
    transcribeModelLabels,
    currentModelUnavailable,
    winkyCatalogLabel,
    winkyCatalogError,
    localServerInstalled,
    localServerRunning,
    localServerLoading,
    localServerError,
    localModelPhase,
    checkingLocalModel,
    localModelDownloaded,
    downloadingLocalModel,
    handleDownloadModel,
    handleWarmupModel,
    downloadButtonLabel,
    localModelError,
    localWarmupInProgress,
    warmupWarningMessage,
    checkingMessage,
    downloadedMessage,
    renderModeInfoButton
}) => {
    return (
        <>
            <div className={'fc gap-2'}>
                <Box sx={{position: 'relative', width: '100%'}}>
                    <TextField
                        select
                        label="Transcribe Mode"
                        value={values.transcribeMode}
                        onChange={(e) => {
                            const transcribeMode = e.target.value as TranscribeMode;
                            emitChange({transcribeMode});
                        }}
                        disabled={disableInputs}
                        fullWidth
                    >
                        <MenuItem value={SPEECH_MODES.API}>API</MenuItem>
                        <MenuItem value={SPEECH_MODES.LOCAL}>Local</MenuItem>
                    </TextField>
                    {renderModeInfoButton('transcribe', disableInputs)}
                </Box>
                <Collapse in={values.transcribeMode === SPEECH_MODES.LOCAL} unmountOnExit>
                    <LocalSpeechInstallControl disabled={disableInputs}/>
                </Collapse>
            </div>
            <div className={'fc gap-1'}>
                {values.transcribeMode === SPEECH_MODES.API && transcribeModelOptions.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{fontStyle: 'italic', py: 1}}>
                        No API keys configured. Add a key below or switch to Local mode.
                    </Typography>
                ) : (
                    <TextField
                        select
                        label="Transcribe Model"
                        value={values.transcribeModel}
                        onChange={(e) => emitChange({transcribeModel: e.target.value as TranscribeModel})}
                        disabled={disableInputs}
                    >
                        {transcribeModelOptions.map((model) => (
                            <MenuItem key={model} value={model}>
                                {transcribeModelLabels[model] || formatTranscribeLabel(model)}
                            </MenuItem>
                        ))}
                    </TextField>
                )}
                {values.transcribeMode === SPEECH_MODES.API && currentModelUnavailable && (
                    <Typography variant="caption" color="warning.main">
                        This saved model is no longer in the supported catalog. Select another model to change it.
                    </Typography>
                )}
                {values.transcribeMode === SPEECH_MODES.API
                    && values.transcribeModel.startsWith('winky-transcribe-')
                    && winkyCatalogLabel && (
                    <Typography variant="caption" color="text.secondary">
                        {winkyCatalogLabel}. Pricing is loaded from Winky backend.
                    </Typography>
                )}
                {values.transcribeMode === SPEECH_MODES.API
                    && values.transcribeModel.startsWith('winky-transcribe-')
                    && winkyCatalogError && (
                    <Typography variant="caption" color="warning.main">
                        {winkyCatalogError}
                    </Typography>
                )}
                {values.transcribeMode === SPEECH_MODES.LOCAL && (
                    <div className={'fc w-full flex-grow gap-1'}>
                        {localServerLoading && !localServerInstalled && (
                            <Typography variant="body2" color="text.secondary" sx={{display: 'flex', gap: 1}}>
                                <CircularProgress size={16} thickness={5} color="inherit"/>
                                Checking local server status...
                            </Typography>
                        )}
                        {!localServerLoading && !localServerInstalled && (
                            <Typography variant="body2" color="warning.main">
                                Local speech is unavailable. Install the server above; the selected model will stay saved.
                            </Typography>
                        )}
                        {localServerInstalled && !localServerRunning && checkingLocalModel && (
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{display: 'flex', gap: 1}}
                            >
                                <CircularProgress size={16} thickness={5} color="inherit"/>
                                {checkingMessage}
                            </Typography>
                        )}
                        {localServerInstalled && !localServerRunning && !checkingLocalModel && localModelDownloaded === true && (
                            <Typography variant="body2" color="info.main">
                                The selected model is installed. Start the server to warm it up.
                            </Typography>
                        )}
                        {localServerInstalled && !localServerRunning && !checkingLocalModel && localModelDownloaded === false && (
                            <Typography variant="body2" color="text.secondary">
                                The selected model is not installed. Start the server to download it.
                            </Typography>
                        )}
                        {localServerRunning
                            && (checkingLocalModel || (localModelDownloaded === null && localModelPhase === 'unknown'))
                            && localModelPhase !== 'downloading' && (
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{display: 'flex', gap: 1}}
                            >
                                <CircularProgress size={16} thickness={5} color="inherit"/>
                                {checkingMessage}
                            </Typography>
                        )}
                        {localServerRunning && downloadingLocalModel && (
                            <Typography variant="body2" color="info.main" sx={{display: 'flex', gap: 1}}>
                                <CircularProgress size={16} thickness={5} color="inherit"/>
                                {downloadButtonLabel}
                            </Typography>
                        )}
                        {localServerRunning && !checkingLocalModel && localWarmupInProgress && (
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
                        {localServerRunning
                            && !checkingLocalModel
                            && !localWarmupInProgress
                            && localModelDownloaded === true
                            && localModelPhase === 'ready' && (
                            <Typography
                                variant="body2"
                                color="success.main"
                                sx={{display: 'flex', gap: 1}}
                            >
                                <CheckCircleIcon style={{marginTop: 3}} fontSize="small"/>
                                {downloadedMessage}
                            </Typography>
                        )}
                        {localServerRunning
                            && localModelPhase === 'installed'
                            && localModelDownloaded === true && (
                            <Typography variant="body2" color="info.main">
                                The model is installed and will be ready after warmup.
                            </Typography>
                        )}
                        {localServerRunning
                            && !checkingLocalModel
                            && localModelDownloaded === false
                            && localModelPhase !== 'downloading' && (
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
                        {localServerRunning && localModelPhase === 'error' && localModelDownloaded === true && (
                            <Button
                                variant="outlined"
                                color="warning"
                                onClick={handleWarmupModel}
                                disabled={disableInputs || localWarmupInProgress}
                                sx={{mt: 0.5, minHeight: '44px'}}
                            >
                                Retry warmup
                            </Button>
                        )}
                        {(localModelError || localServerError) && (
                            <Typography variant="body2" color="error" sx={{mt: 0.5}}>
                                {localModelError || localServerError}
                            </Typography>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};

export default ModelTranscribeSection;
