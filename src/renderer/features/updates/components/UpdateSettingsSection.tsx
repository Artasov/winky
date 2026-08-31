import {useCallback, useEffect, useMemo, useState} from 'react';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SystemUpdateAltRoundedIcon from '@mui/icons-material/SystemUpdateAltRounded';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Typography
} from '@mui/material';
import {useToast} from '../../../context/ToastContext';
import {
    type UpdateProgress,
    type UpdateState,
    updateService
} from '../services/updateService';

const RELEASES_URL = 'https://github.com/Artasov/winky/releases/latest';

const getStatusText = (state: UpdateState | null, progress: UpdateProgress | null): string => {
    if (!state) return 'Update status has not been checked yet.';
    if (state.phase === 'checking') return 'Checking for updates…';
    if (state.phase === 'downloading') return `Downloading Winky ${state.version || ''}: ${progress?.percent ?? 0}%`;
    if (state.phase === 'ready') return `Winky ${state.version} is downloaded and verified.`;
    if (state.phase === 'installing') return `Installing Winky ${state.version}…`;
    if (state.phase === 'available') return `Winky ${state.version} is available.`;
    if (state.phase === 'unsupported') return `Winky ${state.version} is available for manual installation.`;
    if (state.phase === 'error') return state.message || 'The update check failed.';
    if (state.version) return `You are up to date. Latest release: ${state.version}.`;
    return 'You are up to date.';
};

const UpdateSettingsSection = () => {
    const {showToast} = useToast();
    const [state, setState] = useState<UpdateState | null>(null);
    const [progress, setProgress] = useState<UpdateProgress | null>(null);
    const [confirmInstall, setConfirmInstall] = useState(false);

    useEffect(() => {
        let stopped = false;
        let stateEventVersion = 0;
        let unlisteners: Array<() => void> = [];

        const clearListeners = () => {
            const listeners = unlisteners;
            unlisteners = [];
            listeners.forEach((unlisten) => unlisten());
        };
        const subscribe = async () => {
            const addListener = async (registration: Promise<() => void>): Promise<boolean> => {
                const unlisten = await registration;
                if (stopped) {
                    unlisten();
                    return false;
                }
                unlisteners.push(unlisten);
                return true;
            };
            try {
                if (!await addListener(updateService.onState((nextState) => {
                    stateEventVersion += 1;
                    if (!stopped) setState(nextState);
                }))) return;
                if (!await addListener(updateService.onProgress((nextProgress) => {
                    if (!stopped) setProgress(nextProgress);
                }))) return;
            } catch (error) {
                clearListeners();
                throw error;
            }

            const requestedAtVersion = stateEventVersion;
            const snapshot = await updateService.getState();
            if (!stopped && stateEventVersion === requestedAtVersion) setState(snapshot);
        };

        void subscribe().catch((error) => {
            console.warn('[update] Failed to subscribe to settings events', {
                errorType: error instanceof Error ? error.name : 'unknown'
            });
        });
        return () => {
            stopped = true;
            clearListeners();
        };
    }, []);

    const run = useCallback(async (operation: () => Promise<unknown>) => {
        try {
            const result = await operation();
            if (result && typeof result === 'object' && 'phase' in result) {
                setState(result as UpdateState);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(message || 'Update operation failed.', 'error');
        }
    }, [showToast]);

    const busy = state?.phase === 'checking'
        || state?.phase === 'downloading'
        || state?.phase === 'installing';
    const action = useMemo(() => {
        if (state?.phase === 'available') {
            return {
                label: 'Download update',
                icon: <DownloadRoundedIcon/>,
                handler: () => run(() => updateService.download())
            };
        }
        if (state?.phase === 'ready') {
            return {
                label: 'Install update',
                icon: <SystemUpdateAltRoundedIcon/>,
                handler: () => setConfirmInstall(true)
            };
        }
        return {
            label: state?.phase === 'error' ? 'Try again' : 'Check for updates',
            icon: <RefreshRoundedIcon/>,
            handler: () => run(() => updateService.check())
        };
    }, [run, state?.phase]);

    const install = async () => {
        setConfirmInstall(false);
        await run(() => updateService.install());
    };

    return (
        <div className="fc gap-2">
            <Typography variant="body2" fontWeight={600} color="text.primary">
                Updates
            </Typography>
            <Typography variant="caption" color={state?.phase === 'error' ? 'error' : 'text.secondary'}>
                {getStatusText(state, progress)}
            </Typography>
            {state?.phase === 'downloading' && (
                <LinearProgress variant="determinate" value={progress?.percent ?? 0}/>
            )}
            <div className="frc gap-2">
                {state?.phase === 'unsupported' ? (
                    <Button
                        component="a"
                        href={RELEASES_URL}
                        target="_blank"
                        rel="noreferrer"
                        variant="outlined"
                        startIcon={<SystemUpdateAltRoundedIcon/>}
                    >
                        Open releases
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="outlined"
                        startIcon={action.icon}
                        disabled={busy}
                        onClick={action.handler}
                    >
                        {action.label}
                    </Button>
                )}
            </div>
            <Dialog open={confirmInstall} onClose={() => setConfirmInstall(false)}>
                <DialogTitle>Install Winky {state?.version}?</DialogTitle>
                <DialogContent>
                    Winky will close, run the verified installer, and reopen when setup finishes or is canceled.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmInstall(false)}>Cancel</Button>
                    <Button variant="contained" onClick={() => void install()}>Install</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default UpdateSettingsSection;
