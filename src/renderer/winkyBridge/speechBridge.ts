import {transcribeAudio, SpeechTranscribeConfig} from '../services/winkyApi';

export const speechBridge = {
    transcribe: (audioData: ArrayBuffer, config: SpeechTranscribeConfig) => transcribeAudio(audioData, config)
};
