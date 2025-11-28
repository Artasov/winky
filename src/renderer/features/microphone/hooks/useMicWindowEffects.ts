import {useEffect, useRef} from 'react';
import {emit as emitEvent} from '@tauri-apps/api/event';
import {resetInteractive} from '../../../utils/interactive';

type MutableRef<T> = {current: T};

type MicWindowEffectsParams = {
    isMicOverlay: boolean;
    autoStartPendingRef: MutableRef<boolean>;
    isRecordingRef: MutableRef<boolean>;
    processingRef: MutableRef<boolean>;
    handleMicrophoneToggleRef: MutableRef<(() => Promise<void> | void) | null>;
    finishRecording: (resetUI?: boolean) => Promise<Blob | null>;
    setActiveActionId: (value: string | null) => void;
    warmUpRecorder: () => Promise<void>;
};

export const useMicWindowEffects = ({
    isMicOverlay,
    autoStartPendingRef,
    isRecordingRef,
    processingRef,
    handleMicrophoneToggleRef,
    finishRecording,
    setActiveActionId,
    warmUpRecorder
}: MicWindowEffectsParams) => {
    const autoStartRetryTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }

        const api = window.winky;
        if (!api?.on) {
            return;
        }

        const clearAutoStartRetry = () => {
            if (autoStartRetryTimeoutRef.current !== null) {
                window.clearTimeout(autoStartRetryTimeoutRef.current);
                autoStartRetryTimeoutRef.current = null;
            }
        };

        const attemptAutoStart = () => {
            const toggle = handleMicrophoneToggleRef.current;
            if (!toggle) {
                // Увеличиваем интервал повтора, если функция еще не готова
                autoStartRetryTimeoutRef.current = window.setTimeout(attemptAutoStart, 100);
                return;
            }
            // Вызываем toggle асинхронно, но не ждем его завершения для автозапуска
            Promise.resolve(toggle()).catch((error) => {
                console.error('[useMicWindowEffects] Auto-start failed:', error);
            }).finally(() => {
                autoStartPendingRef.current = false;
                clearAutoStartRetry();
            });
        };

        const startHandler = () => {
            if (autoStartPendingRef.current || isRecordingRef.current || processingRef.current) {
                return;
            }
            autoStartPendingRef.current = true;
            // Небольшая задержка, чтобы убедиться, что окно полностью готово
            autoStartRetryTimeoutRef.current = window.setTimeout(() => {
                attemptAutoStart();
            }, 50);
        };

        const visibilityHandler = (first?: { visible?: boolean } | unknown, second?: { visible?: boolean }) => {
            const data = (first && typeof (first as any)?.visible === 'boolean')
                ? (first as { visible?: boolean })
                : second;
            if (data?.visible) {
                // При открытии окна очищаем любые pending состояния и прогреваем рекордер
                clearAutoStartRetry();
                autoStartPendingRef.current = false;
                void warmUpRecorder();
                // Отправляем событие готовности при каждом открытии окна
                // Это важно для повторных открытий после закрытия
                void emitEvent('mic:ready', {visible: true}).catch(() => {});
                return;
            }
            // Очищаем автозапуск только если окно действительно скрывается
            // Не очищаем если идет обработка действия, чтобы избежать закрытия во время обработки
            if (!processingRef.current) {
                clearAutoStartRetry();
                autoStartPendingRef.current = false;
            }
            resetInteractive();
            if (isRecordingRef.current && !processingRef.current) {
                (async () => {
                    try {
                        await finishRecording();
                    } finally {
                        setActiveActionId(null);
                    }
                })();
            }
        };

        const prepareHandler = () => {
            void warmUpRecorder();
        };

        const resetInteractiveHandler = () => {
            resetInteractive();
        };

        api.on('mic:prepare-recording', prepareHandler);
        api.on('mic:start-recording', startHandler);
        api.on('mic:visibility-change', visibilityHandler);
        api.on('mic:reset-interactive', resetInteractiveHandler);

        // Сообщаем о готовности окна только после регистрации обработчиков,
        // чтобы автозапуск записи не терял событие.
        void emitEvent('mic:ready', {visible: true}).catch(() => {});

        return () => {
            clearAutoStartRetry();
            api.removeListener?.('mic:prepare-recording', prepareHandler);
            api.removeListener?.('mic:start-recording', startHandler);
            api.removeListener?.('mic:visibility-change', visibilityHandler);
            api.removeListener?.('mic:reset-interactive', resetInteractiveHandler);
        };
    }, [isMicOverlay, autoStartPendingRef, isRecordingRef, processingRef, handleMicrophoneToggleRef, finishRecording, setActiveActionId, warmUpRecorder]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }

        const api = window.winky;
        if (!api?.on) {
            return;
        }

        const handleFadeIn = () => {
            document.body.classList.remove('fade-out');
            document.body.classList.add('fade-in');
        };

        const handleFadeOut = () => {
            document.body.classList.remove('fade-in');
            document.body.classList.add('fade-out');
        };

        api.on('mic:start-fade-in', handleFadeIn);
        api.on('mic:start-fade-out', handleFadeOut);

        return () => {
            api.removeListener?.('mic:start-fade-in', handleFadeIn);
            api.removeListener?.('mic:start-fade-out', handleFadeOut);
        };
    }, [isMicOverlay]);
};
