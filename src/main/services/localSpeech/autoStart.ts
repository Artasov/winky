import {SPEECH_MODES} from '@shared/constants';
import type {AppConfig} from '@shared/types';
import {sendLogToRenderer} from '../../utils/logger';
import {fastWhisperManager} from './FastWhisperManager';

export const shouldAutoStartLocalSpeech = (config?: AppConfig | null): boolean => {
    if (!config) {
        return false;
    }
    return Boolean(
        config.autoStartLocalSpeechServer &&
        config.setupCompleted &&
        config.speech?.mode === SPEECH_MODES.LOCAL
    );
};

export const ensureLocalSpeechAutoStart = async (config?: AppConfig | null): Promise<void> => {
    if (!shouldAutoStartLocalSpeech(config)) {
        return;
    }
    try {
        await fastWhisperManager.startExisting();
    } catch (error) {
        sendLogToRenderer(
            'AUTO_LOCAL_SPEECH',
            `❌ Failed to auto-start local speech server: ${(error as Error)?.message || error}`
        );
    }
};
