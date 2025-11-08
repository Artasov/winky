import React, {useEffect, useMemo, useState} from 'react';
import {Box, Button, CircularProgress, IconButton, Tooltip, Typography} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import type {FastWhisperStatus} from '@shared/types';

const SUCCESS_DISPLAY_MS = 3_000;

interface LocalSpeechInstallControlProps {
    disabled?: boolean;
}

type PrimaryAction = 'install' | 'start' | 'restart';
type ActionKind = PrimaryAction | 'reinstall';

const actionLabels: Record<ActionKind, string> = {
    install: 'Install',
    start: 'Start',
    restart: 'Restart',
    reinstall: 'Reinstall'
};

const LocalSpeechInstallControl: React.FC<LocalSpeechInstallControlProps> = ({disabled = false}) => {
    const [status, setStatus] = useState<FastWhisperStatus | null>(null);
    const [loadingAction, setLoadingAction] = useState<ActionKind | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let mounted = true;

        const fetchStatus = async () => {
            try {
                const nextStatus = await window.winky?.localSpeech?.getStatus();
                if (mounted && nextStatus) {
                    console.info('[LocalSpeechInstallControl] fetchStatus ->', nextStatus.phase, nextStatus);
                    setStatus(nextStatus);
                    setErrorMessage(nextStatus.error ?? null);
                }
            } catch (error: any) {
                console.warn('[LocalSpeechInstallControl] fetchStatus failed', error);
                if (mounted) {
                    setErrorMessage(error?.message || 'Failed to request local server status.');
                }
            }
        };

        void fetchStatus();

        const handleFocus = () => {
            void fetchStatus();
        };

        window.addEventListener('focus', handleFocus);
        const pollInterval = setInterval(() => {
            void fetchStatus();
        }, 15_000);

        const unsubscribe = window.winky?.localSpeech?.onStatus?.((nextStatus) => {
            if (!mounted) {
                return;
            }
            console.info('[LocalSpeechInstallControl] push status ->', nextStatus.phase, nextStatus);
            setStatus(nextStatus);
            setErrorMessage(nextStatus.error ?? null);
        });

        return () => {
            mounted = false;
            window.removeEventListener('focus', handleFocus);
            clearInterval(pollInterval);
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        if (!status?.lastSuccessAt) {
            return;
        }
        const remaining = SUCCESS_DISPLAY_MS - (Date.now() - status.lastSuccessAt);
        if (remaining <= 0) {
            return;
        }
        const timer = setTimeout(() => {
            setTick((value) => value + 1);
        }, Math.max(remaining + 50, 0));
        return () => {
            clearTimeout(timer);
        };
    }, [status?.lastSuccessAt]);

    const showSuccessState = useMemo(() => {
        if (!status?.lastSuccessAt) {
            return false;
        }
        return Date.now() - status.lastSuccessAt < SUCCESS_DISPLAY_MS;
    }, [status?.lastSuccessAt, status?.updatedAt, tick]);

    const isRunning = status?.phase === 'running';
    const busyPhase = status?.phase === 'installing' || status?.phase === 'starting' || status?.phase === 'stopping';
    const isBusy = loadingAction !== null || busyPhase;

    const isLoading = status === null;
    const safeStatus: FastWhisperStatus = status ?? {
        installed: false,
        running: false,
        phase: 'not-installed',
        message: 'Checking server status…',
        updatedAt: Date.now()
    };

    const primaryAction: PrimaryAction = useMemo(() => {
        if (!safeStatus.installed) {
            return 'install';
        }
        return safeStatus.running ? 'restart' : 'start';
    }, [safeStatus.installed, safeStatus.running]);

    const primaryLabel = actionLabels[primaryAction];
    const successLabel = safeStatus.lastAction
        ? actionLabels[safeStatus.lastAction as ActionKind] ?? primaryLabel
        : primaryLabel;

    const derivedMessage = useMemo(() => {
        if (isRunning || showSuccessState) {
            return '';
        }
        if (errorMessage) {
            return errorMessage;
        }
        if (busyPhase) {
            switch (safeStatus.phase) {
                case 'installing':
                    return 'Дождитесь окончания установки…';
                case 'starting':
                    return 'Запуск локального сервера…';
                case 'stopping':
                    return 'Останавливаем локальный сервер…';
            }
        }
        return safeStatus.message || '';
    }, [errorMessage, safeStatus.message, isRunning, showSuccessState, busyPhase, safeStatus.phase]);

    const messageColor = useMemo(() => {
        if (errorMessage || safeStatus.phase === 'error') {
            return 'error.main';
        }
        if (safeStatus.phase === 'running') {
            return 'success.main';
        }
        return 'text.secondary';
    }, [errorMessage, safeStatus.phase]);

    const logSnippet = useMemo(() => {
        if (isRunning || showSuccessState) {
            return '';
        }
        if (!safeStatus.logLine) {
            return '';
        }
        return safeStatus.logLine.length > 180 ? `${safeStatus.logLine.slice(0, 179)}…` : safeStatus.logLine;
    }, [safeStatus.logLine, safeStatus.updatedAt, isRunning, showSuccessState]);

    const callOperation = async (action: ActionKind, fn: () => Promise<FastWhisperStatus | undefined>) => {
        if (!window.winky?.localSpeech) {
            setErrorMessage('Local speech API is unavailable.');
            return;
        }
        setLoadingAction(action);
        setErrorMessage(null);
        try {
            const result = await fn();
            if (result) {
                console.info('[LocalSpeechInstallControl] action result', action, result.phase);
                setStatus(result);
                setErrorMessage(result.error ?? null);
            }
        } catch (error: any) {
            console.error('[LocalSpeechInstallControl] action error', action, error);
            const fallback =
                action === 'install'
                    ? 'Failed to install fast-fast-whisper.'
                    : action === 'start'
                        ? 'Failed to start fast-fast-whisper.'
                        : action === 'restart'
                            ? 'Failed to restart fast-fast-whisper.'
                            : 'Failed to reinstall fast-fast-whisper.';
            setErrorMessage(error?.message || fallback);
        } finally {
            setLoadingAction((current) => (current === action ? null : current));
        }
    };

    const handleInstall = () => callOperation('install', () => window.winky!.localSpeech!.install());
    const handleStart = () => callOperation('start', () => window.winky!.localSpeech!.start());
    const handleRestart = () => callOperation('restart', () => window.winky!.localSpeech!.restart());
    const handleReinstall = () => callOperation('reinstall', () => window.winky!.localSpeech!.reinstall());

    const handlePrimaryClick = () => {
        if (showSuccessState) {
            return;
        }
        switch (primaryAction) {
            case 'install':
                void handleInstall();
                break;
            case 'start':
                void handleStart();
                break;
            case 'restart':
                void handleRestart();
                break;
        }
    };

    const primaryDisabled = disabled || isBusy || showSuccessState;
    const reinstallDisabled = disabled || isBusy;
    const showPrimarySpinner = isBusy && !showSuccessState && loadingAction !== 'reinstall';
    const showReinstallSpinner = loadingAction === 'reinstall';
    const buttonColor = showSuccessState && status?.phase === 'running' ? 'success' : 'primary';

    const renderPrimaryControl = () => {
        if (isLoading) {
            return (
                <Button
                    variant="outlined"
                    disabled
                    fullWidth
                    sx={{
                        minHeight: 48,
                        textTransform: 'none',
                        fontWeight: 600
                    }}
                >
                    <CircularProgress size={18}/>
                </Button>
            );
        }

        if (isRunning) {
            const restartDisabled = disabled || isBusy || loadingAction === 'restart';
            return (
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderRadius: 3,
                        border: '1px solid rgba(16,185,129,0.4)',
                        backgroundColor: 'rgba(16,185,129,0.08)',
                        px: 2,
                        py: 1.25,
                        transition: 'opacity 120ms ease'
                    }}
                >
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 0.75}}>
                        {showSuccessState ? <CheckCircleIcon fontSize="small" color="success"/> : null}
                        <Typography fontWeight={700} color="success.main">
                            {showSuccessState ? 'Success' : 'Running'}
                        </Typography>
                    </Box>
                    <Tooltip title="Restart server">
                        <span>
                            <IconButton
                                size="small"
                                color="success"
                                onClick={() => void handleRestart()}
                                disabled={restartDisabled}
                            >
                                {loadingAction === 'restart' ? (
                                    <CircularProgress size={18} sx={{color: 'success.main'}}/>
                                ) : (
                                    <RestartAltIcon fontSize="small"/>
                                )}
                            </IconButton>
                        </span>
                    </Tooltip>
                </Box>
            );
        }

        return (
            <Button
                variant="contained"
                color={buttonColor}
                onClick={handlePrimaryClick}
                disabled={primaryDisabled}
                fullWidth
                sx={{
                    minHeight: 48,
                    textTransform: 'none',
                    fontWeight: 600
                }}
            >
                {showSuccessState && status?.phase === 'running' ? (
                    <>
                        <CheckCircleIcon fontSize="small" sx={{mr: 1}}/>
                        {successLabel}
                    </>
                ) : showPrimarySpinner ? (
                    <CircularProgress size={18} sx={{color: 'inherit'}}/>
                ) : (
                    primaryLabel
                )}
            </Button>
        );
    };

    const showMessages = Boolean(derivedMessage) || Boolean(logSnippet);
    const showReinstall = safeStatus.installed && !isRunning && !isBusy && !isLoading;

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: showReinstall || showMessages ? 0.75 : 0.5,
            minWidth: {xs: '100%', sm: 260}
        }}>
            {renderPrimaryControl()}

            {showReinstall ? (
                <Button
                    variant="outlined"
                    color="warning"
                    onClick={() => void handleReinstall()}
                    disabled={reinstallDisabled}
                    fullWidth
                    sx={{
                        minHeight: 40,
                        textTransform: 'none',
                        fontWeight: 600
                    }}
                >
                    {showReinstallSpinner ? <CircularProgress size={18}/> : actionLabels.reinstall}
                </Button>
            ) : null}

            {showMessages ? (
                <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.25}}>
                    {derivedMessage ? (
                        <Typography variant="caption" sx={{color: messageColor}}>
                            {derivedMessage}
                        </Typography>
                    ) : null}
                    {logSnippet ? (
                        <Typography
                            variant="caption"
                            sx={{
                                color: 'text.secondary',
                                fontFamily: 'monospace',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}
                        >
                            {logSnippet}
                        </Typography>
                    ) : null}
                </Box>
            ) : null}
        </Box>
    );
};

export default LocalSpeechInstallControl;
