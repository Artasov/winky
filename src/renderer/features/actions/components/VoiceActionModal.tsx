import React, {forwardRef, useEffect, useMemo} from 'react';
import {
    Alert,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    Fade,
    IconButton,
    Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {useVoiceActionCreator} from '../hooks/useVoiceActionCreator';
import type {ActionFormValues} from '../hooks/useActionForm';
import type {AppConfig} from '@shared/types';
import classNames from 'classnames';
import RecordedWaveform from './RecordedWaveform';

type VoiceActionModalProps = {
    open: boolean;
    onClose: () => void;
    onActionGenerated: (values: Partial<ActionFormValues>) => void;
    config: AppConfig | null;
    showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
};

const DialogTransition = forwardRef(function DialogTransition(
    props: React.ComponentProps<typeof Fade>,
    ref: React.Ref<unknown>
) {
    return <Fade timeout={280} ref={ref} {...props} easing="cubic-bezier(0.4, 0, 0.2, 1)"/>;
});

const ringMultipliers = [4, 3, 2, 1];

const VoiceActionModal: React.FC<VoiceActionModalProps> = ({
    open,
    onClose,
    onActionGenerated,
    config,
    showToast
}) => {
    const {
        state,
        errorMessage,
        transcribedText,
        volume,
        waveform,
        startRecording,
        stopRecording,
        processRecording,
        cancelRecording,
        abortGeneration,
        reset,
        isRecording,
        isReady,
        isProcessing,
        hasError
    } = useVoiceActionCreator({
        config,
        showToast,
        onActionGenerated: (values) => {
            onActionGenerated(values);
            onClose();
        }
    });

    useEffect(() => {
        if (!open) {
            reset();
        }
    }, [open, reset]);

    const handleClose = () => {
        if (isRecording) {
            cancelRecording();
        } else {
            onClose();
        }
    };

    const handleMicClick = () => {
        if (isRecording) {
            void stopRecording();
        } else if (isReady) {
            // Перезапись - сбрасываем и начинаем новую запись
            cancelRecording();
            void startRecording();
        } else if (!isProcessing) {
            void startRecording();
        }
    };

    const getStatusText = () => {
        switch (state) {
            case 'recording':
                return 'Recording...';
            case 'ready':
                return 'Ready to generate';
            case 'transcribing':
                return 'Transcribing...';
            case 'generating':
                return 'Generating...';
            case 'error':
                return 'Error';
            default:
                return 'Tap to speak';
        }
    };

    const micSize = isRecording ? 56 : 80;

    // Усиливаем входной сигнал и применяем логарифмическое сжатие
    const compressedVolume = useMemo(() => {
        if (volume <= 0) return 0;
        // Усиливаем в 2.5 раза и применяем логарифм для сжатия динамического диапазона
        const boosted = Math.min(1, volume * 2.5);
        // Логарифм сжимает: тихие звуки усиливаются, громкие приглушаются
        return Math.log1p(boosted * 10) / Math.log1p(10);
    }, [volume]);

    const baseWaveScale = 1.15;
    const maxAdditionalScale = 0.4;
    const waveScale = useMemo(() => baseWaveScale + (1 - compressedVolume) * maxAdditionalScale, [compressedVolume]);

    const logVolume = useMemo(() => {
        if (volume <= 0) return 0;
        const boosted = Math.min(1, volume * 2.5);
        return Math.log1p(boosted * 10) / Math.log1p(10);
    }, [volume]);

    const minVolumeThreshold = 0.02;
    const firstRingSize = micSize - 12;

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="xs"
            closeAfterTransition
            slots={{transition: DialogTransition}}
            slotProps={{
                transition: {
                    timeout: 280,
                    unmountOnExit: true,
                    mountOnEnter: true
                },
                paper: {
                    sx: {
                        borderRadius: 3,
                        p: 2,
                        width: '360px'
                    }
                }
            }}
        >
            <IconButton
                onClick={handleClose}
                size="small"
                disabled={isProcessing}
                sx={{
                    position: 'absolute',
                    right: 12,
                    top: 12,
                    zIndex: 1
                }}
            >
                <CloseIcon fontSize="small"/>
            </IconButton>

            <DialogContent sx={{pt: 4, pb: 2}}>
                <div className="fc gap-3 items-center">
                    <div style={{width: '140px', height: '140px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        {/* Volume rings */}
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{overflow: 'visible'}}>
                            {ringMultipliers.map((multiplier) => (
                                <div
                                    key={multiplier}
                                    className="absolute rounded-full border-[3px]"
                                    style={{
                                        width: `${firstRingSize + (multiplier - 1) * 20}px`,
                                        height: `${firstRingSize + (multiplier - 1) * 20}px`,
                                        boxSizing: 'content-box',
                                        borderColor: isRecording
                                            ? `rgba(239, 68, 68, ${0.7 - (multiplier - 1) * 0.1})`
                                            : 'rgba(16, 185, 129, 0.5)',
                                        opacity: isRecording && logVolume > minVolumeThreshold
                                            ? Math.max(0, (logVolume - minVolumeThreshold) / (1 - minVolumeThreshold) - (multiplier - 1) * 0.12)
                                            : 0,
                                        transform: `scale(${isRecording ? waveScale * (1 - (multiplier - 1) * 0.05) : 0.95})`,
                                        boxShadow: isRecording
                                            ? `0 0 ${5 + logVolume * 8}px ${2 + logVolume * 4}px rgba(239, 68, 68, ${0.2 + logVolume * 0.15})`
                                            : 'none',
                                        transition: 'opacity 0.15s ease, transform 0.15s ease'
                                    }}
                                />
                            ))}
                        </div>

                        {isProcessing && (
                            <CircularProgress
                                size={140}
                                thickness={2}
                                sx={{
                                    position: 'absolute',
                                    color: 'primary.main',
                                    opacity: 0.4
                                }}
                            />
                        )}

                        {/* Microphone button */}
                        <button
                            type="button"
                            onClick={handleMicClick}
                            disabled={isProcessing}
                            className={classNames(
                                'pointer-events-auto relative z-10',
                                'flex items-center justify-center rounded-full shadow-xl outline-none',
                                isRecording
                                    ? 'bg-rose-600 hover:bg-rose-500'
                                    : 'bg-white',
                                isProcessing && 'opacity-60 cursor-not-allowed',
                                !isProcessing && 'cursor-pointer'
                            )}
                            style={{
                                width: `${micSize}px`,
                                height: `${micSize}px`,
                                transform: isRecording ? 'scale(0.7)' : 'scale(1)',
                                transition: 'transform 0.3s ease-in-out, background-color 0.3s ease-in-out'
                            }}
                        >
                            {/* Mic icon */}
                            <svg
                                viewBox="0 0 24 24"
                                className={classNames(
                                    'absolute h-10 w-10 fill-current pointer-events-none text-black transition-opacity duration-300',
                                    isRecording ? 'opacity-0' : 'opacity-100'
                                )}
                            >
                                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/>
                                <path d="M19 12a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V21h-3a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.07A7 7 0 0 0 19 12z"/>
                            </svg>

                            {/* Stop icon */}
                            <svg
                                viewBox="0 0 24 24"
                                className={classNames(
                                    'absolute h-10 w-10 fill-current pointer-events-none text-white transition-opacity duration-300',
                                    isRecording ? 'opacity-100' : 'opacity-0'
                                )}
                            >
                                <rect x="6" y="6" width="12" height="12" rx="2"/>
                            </svg>
                        </button>
                    </div>

                    {!isRecording && (
                        <Typography
                            variant="body1"
                            color={hasError ? 'error' : 'text.primary'}
                            fontWeight={600}
                            textAlign="center"
                        >
                            {getStatusText()}
                        </Typography>
                    )}

                    {hasError && errorMessage && (
                        <Alert severity="error" sx={{width: '100%', mt: 1}}>
                            {errorMessage}
                        </Alert>
                    )}

                    {isReady && waveform.length > 0 && (
                        <div className="w-full">
                            <RecordedWaveform waveform={waveform} />
                            <Typography variant="caption" color="text.secondary" textAlign="center" display="block" mt={1}>
                                Tap mic to re-record
                            </Typography>
                        </div>
                    )}

                    {!hasError && !isProcessing && !isReady && !isRecording && (
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            textAlign="center"
                        >
                            Describe your action
                        </Typography>
                    )}
                </div>
            </DialogContent>

            <DialogActions sx={{px: 2, pb: 2, justifyContent: 'center'}}>
                {hasError ? (
                    <div className="fr gap-2 w-full">
                        <Button onClick={handleClose} variant="outlined" fullWidth>
                            Close
                        </Button>
                        <Button onClick={reset} variant="contained" fullWidth>
                            Try again
                        </Button>
                    </div>
                ) : isProcessing ? (
                    <Button onClick={abortGeneration} variant="contained" color="error" fullWidth>
                        Stop
                    </Button>
                ) : isReady ? (
                    <Button onClick={() => void processRecording()} variant="contained" fullWidth>
                        Generate
                    </Button>
                ) : (
                    <Button onClick={handleClose} variant="outlined" fullWidth>
                        Cancel
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default VoiceActionModal;
