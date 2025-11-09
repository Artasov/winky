import {useEffect} from 'react';
import type {ToastType} from '../../context/ToastContext';

interface ToastBridgeOptions {
    enabled: boolean;
    showToast: (message: string, type?: ToastType, options?: { durationMs?: number }) => void;
}

export const useToastBridge = ({enabled, showToast}: ToastBridgeOptions): void => {
    useEffect(() => {
        if (!enabled || !window.winky?.on) {
            return;
        }
        const handler = (payload?: { message?: string; type?: ToastType; options?: { durationMs?: number } }) => {
            if (!payload?.message) {
                return;
            }
            showToast(payload.message, payload.type ?? 'info', payload.options);
        };
        window.winky.on('app:toast', handler as any);
        return () => {
            window.winky?.removeListener?.('app:toast', handler as any);
        };
    }, [enabled, showToast]);
};
