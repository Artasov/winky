import {transcribeAudio, SpeechTranscribeConfig, SpeechTranscribeOptions} from '../services/winkyApi';

export const speechBridge = {
    transcribe: (
        audioData: ArrayBuffer,
        config: SpeechTranscribeConfig,
        options?: SpeechTranscribeOptions
    ) => transcribeAudio(audioData, config, options)
};
