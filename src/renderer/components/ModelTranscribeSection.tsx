import React from 'react';
import {Box, Button, CircularProgress, Collapse, MenuItem, TextField, Typography} from '@mui/material';
import type {TranscribeMode, TranscribeModel} from '@shared/types';
import {SPEECH_MODES} from '@shared/constants';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalSpeechInstallControl from './LocalSpeechInstallControl';
import {formatTranscribeLabel} from '../utils/modelFormatters';

type ModelTranscribeSectionProps = {
    values: {
        transcribeMode: TranscribeMode;
        transcribeModel: TranscribeModel;
    };
    emitChange: (partial: Partial<{transcribeMode: TranscribeMode; transcribeModel: TranscribeModel}>) => void;
    disableInputs: boolean;
    transcribeModelOptions: TranscribeModel[];
    localServerInstalled: boolean;
    localServerRunning: boolean;
    checkingLocalModel: boolean;
    localModelDownloaded: boolean | null;
    downloadingLocalModel: boolean;
    handleDownloadModel: () => void;
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
    localServerInstalled,
    localServerRunning,
    checkingLocalModel,
    localModelDownloaded,
    downloadingLocalModel,
    handleDownloadModel,
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
                        disabled={disableInputs || (values.transcribeMode === SPEECH_MODES.LOCAL && (!localServerInstalled || !localServerRunning))}
                    >
                        {transcribeModelOptions.map((model) => (
                            <MenuItem key={model} value={model}>
                                {formatTranscribeLabel(model)}
                            </MenuItem>
                        ))}
                    </TextField>
                )}
                {values.transcribeMode === SPEECH_MODES.LOCAL && localServerInstalled && localServerRunning && (
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
        </>
    );
};

export default ModelTranscribeSection;
