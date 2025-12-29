import React, {useEffect, useMemo, useState} from 'react';
import {open} from '@tauri-apps/plugin-dialog';
import {invoke} from '@tauri-apps/api/core';
import {Box, Button, CircularProgress, IconButton, Tooltip, Typography} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import DescriptionIcon from '@mui/icons-material/Description';
import type {FastWhisperStatus} from '@shared/types';
import {useLocalSpeechStatus} from '../hooks/useLocalSpeechStatus';
import {localSpeechBridge} from '../services/winkyBridge';

const SUCCESS_DISPLAY_MS = 3_000;

interface LocalSpeechInstallControlProps {
    disabled?: boolean;
}

type PrimaryAction = 'install' | 'start' | 'restart';
type ActionKind = PrimaryAction | 'reinstall' | 'stop';

const actionLabels: Record<ActionKind, string> = {
    install: 'Install',
    start: 'Start',
    restart: 'Restart',
    reinstall: 'Reinstall',
    stop: 'Stop'
};
const FAST_WHISPER_INSTALL_SIZE_HINT = '≈43 MB';

const LocalSpeechInstallControl: React.FC<LocalSpeechInstallControlProps> = ({disabled = false}) => {
    const [loadingAction, setLoadingAction] = useState<ActionKind | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const {
        status,
        error: statusError,
        loading: statusLoading,
        setStatus
    } = useLocalSpeechStatus({
        checkHealthOnMount: true,
        onStatus: (nextStatus) => {
            setErrorMessage(nextStatus?.error ?? null);
        },
        onError: (message) => setErrorMessage(message)
    });

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

    const combinedErrorMessage = errorMessage ?? status?.error ?? statusError;
    const isRunning = status?.phase === 'running';
    const busyPhase = status?.phase === 'installing' || status?.phase === 'starting' || status?.phase === 'stopping';
    const isBusy = loadingAction !== null || busyPhase;

    const isLoading = status === null || statusLoading;
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
    const primaryLabelWithSize =
        primaryAction === 'install'
            ? `${primaryLabel} (${FAST_WHISPER_INSTALL_SIZE_HINT})`
            : primaryLabel;
    const successLabel = safeStatus.lastAction
        ? actionLabels[safeStatus.lastAction as ActionKind] ?? primaryLabel
        : primaryLabel;
    const showStoppedPanel = safeStatus.installed && !isRunning && !isLoading && !busyPhase;

    const derivedMessage = useMemo(() => {
        if (isRunning || showSuccessState) {
            return '';
        }
        if (combinedErrorMessage) {
            return combinedErrorMessage;
        }
        if (busyPhase) {
            switch (safeStatus.phase) {
                case 'installing':
                    return 'Please wait for the installation to finish…';
                case 'starting':
                    return 'Starting the local server…';
                case 'stopping':
                    return 'Stopping the local server…';
            }
        }
        return safeStatus.message || '';
    }, [combinedErrorMessage, safeStatus.message, isRunning, showSuccessState, busyPhase, safeStatus.phase]);

    const messageColor = useMemo(() => {
        if (combinedErrorMessage || safeStatus.phase === 'error') {
            return 'error.main';
        }
        if (safeStatus.phase === 'running') {
            return 'success.main';
        }
        return 'text.secondary';
    }, [combinedErrorMessage, safeStatus.phase]);

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

    const pickInstallDirectory = async (initialPath?: string) => {
        const selection = await open({
            title: 'Select a folder for the local speech server',
            directory: true,
            multiple: false,
            defaultPath: initialPath || undefined
        });
        if (!selection) {
            return null;
        }
        return Array.isArray(selection) ? selection[0] ?? null : selection;
    };

    const handleInstall = async () => {
        const targetDir = await pickInstallDirectory(status?.installDir || undefined);
        if (!targetDir) {
            return;
        }
        await callOperation('install', () => localSpeechBridge.install(targetDir));
    };
    const handleStart = () => callOperation('start', () => localSpeechBridge.start());
    const handleRestart = () => callOperation('restart', () => localSpeechBridge.restart());
    const handleStop = () => callOperation('stop', () => localSpeechBridge.stop());
    const handleReinstall = async () => {
        const confirmed =
            typeof window === 'undefined' ||
            window.confirm('Reinstalling will remove the local server and downloaded models. Continue?');
        if (!confirmed) {
            return;
        }
        const targetDir = await pickInstallDirectory(status?.installDir || undefined);
        if (!targetDir) {
            return;
        }
        await callOperation('reinstall', () => localSpeechBridge.reinstall(targetDir));
    };

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

    const handleOpenLogs = async () => {
        if (!status?.installDir) {
            console.warn('[LocalSpeechInstallControl] Cannot open logs: installDir is not available');
            return;
        }
        // Нормализуем путь: убираем лишние слеши и используем правильные разделители для платформы
        const isWindows = navigator.platform.toLowerCase().includes('win');
        const pathSeparator = isWindows ? '\\' : '/';
        let installDir = status.installDir.replace(/[/\\]+$/, ''); // Убираем завершающие слеши
        // Нормализуем разделители в installDir
        if (isWindows) {
            installDir = installDir.replace(/\//g, '\\');
        } else {
            installDir = installDir.replace(/\\/g, '/');
        }
        const logPath = `${installDir}${pathSeparator}fast-fast-whisper${pathSeparator}fast-fast-whisper.log`;
        console.log('[LocalSpeechInstallControl] Opening log file:', logPath);
        console.log('[LocalSpeechInstallControl] Install dir:', installDir);
        console.log('[LocalSpeechInstallControl] Platform:', navigator.platform);
        try {
            await invoke('open_file_path', {filePath: logPath});
            console.log('[LocalSpeechInstallControl] Successfully requested to open log file:', logPath);
        } catch (error) {
            console.error('[LocalSpeechInstallControl] Failed to open log file:', logPath, error);
        }
    };

    const primaryDisabled = disabled || isBusy || showSuccessState;
    const reinstallDisabled = disabled || isBusy;
    const showPrimarySpinner = isBusy && !showSuccessState && loadingAction !== 'reinstall';
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
            const stopDisabled = disabled || isBusy || loadingAction === 'stop';
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
                        transition: 'opacity 120ms ease',
                        gap: 1.25
                    }}
                >
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 0.75}}>
                        {showSuccessState ? <CheckCircleIcon fontSize="small" color="success"/> : null}
                        <Typography fontWeight={700} color="success.main">
                            {showSuccessState ? 'Success' : 'Running'}
                        </Typography>
                    </Box>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                        <Tooltip title="Open logs">
                            <span>
                                <IconButton
                                    size="small"
                                    color="success"
                                    onClick={() => void handleOpenLogs()}
                                    disabled={disabled || !status?.installDir}
                                >
                                    <DescriptionIcon fontSize="small"/>
                                </IconButton>
                            </span>
                        </Tooltip>
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
                        <Tooltip title="Stop server">
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={() => void handleStop()}
                                    disabled={stopDisabled}
                                    sx={{
                                        color: stopDisabled ? 'text.disabled' : 'text.primary',
                                        '&:hover': {
                                            color: 'error.main',
                                            backgroundColor: 'rgba(239,68,68,0.12)'
                                        }
                                    }}
                                >
                                    {loadingAction === 'stop' ? (
                                        <CircularProgress size={18} sx={{color: 'error.main'}}/>
                                    ) : (
                                        <StopCircleIcon fontSize="small"/>
                                    )}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Box>
                </Box>
            );
        }

        if (showStoppedPanel) {
            const startDisabled = disabled || isBusy || loadingAction === 'start';
            const reinstallButtonDisabled = reinstallDisabled || loadingAction === 'reinstall';

            return (
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderRadius: 3,
                        border: '1px solid rgba(107,114,128,0.35)',
                        backgroundColor: 'rgba(107,114,128,0.12)',
                        px: 2,
                        py: 1.25,
                        transition: 'opacity 120ms ease',
                        gap: 1.25
                    }}
                >
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 0.75}}>
                        <Typography fontWeight={700} color="text.secondary">
                            Stopped
                        </Typography>
                    </Box>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                        <Tooltip title="Start server">
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={() => void handleStart()}
                                    disabled={startDisabled}
                                    sx={{
                                        color: startDisabled ? 'text.disabled' : 'primary.main',
                                        '&:hover': {
                                            color: 'primary.main',
                                            backgroundColor: 'rgba(59,130,246,0.12)'
                                        }
                                    }}
                                >
                                    {loadingAction === 'start' ? (
                                        <CircularProgress size={18} sx={{color: 'primary.main'}}/>
                                    ) : (
                                        <PlayArrowRoundedIcon fontSize="small"/>
                                    )}
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="Reinstall server">
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={() => void handleReinstall()}
                                    disabled={reinstallButtonDisabled}
                                    sx={{
                                        color: reinstallButtonDisabled ? 'text.disabled' : 'warning.main',
                                        '&:hover': {
                                            color: 'warning.main',
                                            backgroundColor: 'rgba(234,179,8,0.12)'
                                        }
                                    }}
                                >
                                    {loadingAction === 'reinstall' ? (
                                        <CircularProgress size={18} sx={{color: 'warning.main'}}/>
                                    ) : (
                                        <SettingsBackupRestoreIcon fontSize="small"/>
                                    )}
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Box>
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
                    primaryLabelWithSize
                )}
            </Button>
        );
    };

    const showInstallDir = Boolean(safeStatus.installDir);
    const showMessages = Boolean(derivedMessage) || Boolean(logSnippet) || showInstallDir;

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: showMessages ? 0.75 : 0.5,
            minWidth: {xs: '100%', sm: 260}
        }}>
            {renderPrimaryControl()}
            {showMessages ? (
                <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.25}}>
                    {derivedMessage ? (
                        <Typography variant="caption" sx={{color: messageColor}}>
                            {derivedMessage}
                        </Typography>
                    ) : null}
                    {safeStatus.installDir ? (
                        <Typography
                            variant="caption"
                            title={safeStatus.installDir}
                            sx={{
                                color: 'text.secondary',
                                fontFamily: 'monospace',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}
                        >
                            {`Install path: ${safeStatus.installDir}`}
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
