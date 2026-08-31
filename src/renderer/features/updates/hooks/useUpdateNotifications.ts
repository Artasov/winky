import {useEffect} from 'react';
import {toast} from 'react-toastify';
import {type UpdateState, updateService} from '../services/updateService';

const UPDATE_AVAILABLE_TOAST_ID = 'winky-update-available';
const UPDATE_INSTALL_TOAST_ID = 'winky-update-install';
const UPDATE_ERROR_TOAST_ID = 'winky-update-error';

const notifyState = (state: UpdateState): void => {
    if (state.phase === 'error') {
        toast.error(`Update failed: ${state.message || 'Unknown update error.'}`, {
            toastId: UPDATE_ERROR_TOAST_ID,
            autoClose: 8_000
        });
        return;
    }
    if (!state.updateAvailable || !state.version) return;
    if (state.phase !== 'available' && state.phase !== 'unsupported') return;

    const suffix = state.installSupported
        ? 'Open Settings to download it.'
        : 'Automatic installation is unavailable on this platform.';
    toast.info(`Winky ${state.version} is available. ${suffix}`, {
        toastId: UPDATE_AVAILABLE_TOAST_ID,
        autoClose: 10_000
    });
};

export const useUpdateNotifications = (enabled: boolean): void => {
    useEffect(() => {
        if (!enabled) return;
        let stopped = false;
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
                if (!await addListener(updateService.onState((state) => {
                    if (!stopped) notifyState(state);
                }))) return;
                if (!await addListener(updateService.onStarted((update) => {
                    if (stopped) return;
                    toast.info(`Installing Winky ${update.version}. The app will close to finish setup.`, {
                        toastId: UPDATE_INSTALL_TOAST_ID,
                        autoClose: false
                    });
                }))) return;
                if (!await addListener(updateService.onError((error) => {
                    if (stopped) return;
                    toast.error(`Update failed: ${error.message}`, {
                        toastId: UPDATE_ERROR_TOAST_ID,
                        autoClose: 8_000
                    });
                }))) return;
            } catch (error) {
                clearListeners();
                throw error;
            }
            const state = await updateService.getState();
            if (!stopped) notifyState(state);
        };

        void subscribe().catch((error) => {
            console.warn('[update] Failed to subscribe to update events', {
                errorType: error instanceof Error ? error.name : 'unknown'
            });
        });
        return () => {
            stopped = true;
            clearListeners();
        };
    }, [enabled]);
};
