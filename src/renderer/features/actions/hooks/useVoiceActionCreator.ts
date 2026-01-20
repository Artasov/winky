import {useCallback, useRef, useState} from 'react';
import {speechBridge} from '../../../winkyBridge/speechBridge';
import {createLLMService} from '../../../services/llm/factory';
import {VOICE_ACTION_SYSTEM_PROMPT} from '../prompts/voiceActionPrompt';
import type {ActionFormValues} from './useActionForm';
import type {AppConfig} from '@shared/types';

type UseVoiceActionCreatorParams = {
    config: AppConfig | null;
    showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
    onActionGenerated: (values: Partial<ActionFormValues>) => void;
};

type RecordingState = 'idle' | 'recording' | 'ready' | 'transcribing' | 'generating' | 'error';

export const useVoiceActionCreator = ({
    config,
    showToast,
    onActionGenerated
}: UseVoiceActionCreatorParams) => {
    const [state, setState] = useState<RecordingState>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [transcribedText, setTranscribedText] = useState<string>('');
    const [volume, setVolume] = useState<number>(0);
    const [waveform, setWaveform] = useState<number[]>([]);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const startVolumeMonitoring = useCallback((stream: MediaStream) => {
        try {
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const buffer = new Uint8Array(analyser.fftSize);
            const lastSampleTimeRef = {current: 0};

            const updateVolume = () => {
                if (!analyserRef.current) {
                    return;
                }

                const now = performance.now();
                if (now - lastSampleTimeRef.current < 40) {
                    animationFrameRef.current = requestAnimationFrame(updateVolume);
                    return;
                }
                lastSampleTimeRef.current = now;

                analyser.getByteTimeDomainData(buffer);
                let sumSquares = 0;
                for (let i = 0; i < buffer.length; i++) {
                    const deviation = buffer[i] - 128;
                    sumSquares += deviation * deviation;
                }
                const rms = Math.sqrt(sumSquares / buffer.length) / 128;
                const normalizedVolume = Number.isFinite(rms) ? rms : 0;
                setVolume(normalizedVolume);

                animationFrameRef.current = requestAnimationFrame(updateVolume);
            };

            updateVolume();
        } catch (error) {
            console.error('[useVoiceActionCreator] Failed to start volume monitoring:', error);
        }
    }, []);

    const generateWaveform = useCallback(async (audioBuffer: ArrayBuffer): Promise<number[]> => {
        try {
            const audioContext = new AudioContext();
            const audioBufferData = await audioContext.decodeAudioData(audioBuffer.slice(0));
            const rawData = audioBufferData.getChannelData(0);
            const samples = 48;
            const blockSize = Math.floor(rawData.length / samples);
            const waveformData: number[] = [];

            for (let i = 0; i < samples; i++) {
                const start = blockSize * i;
                let sum = 0;
                for (let j = 0; j < blockSize; j++) {
                    sum += Math.abs(rawData[start + j]);
                }
                const average = sum / blockSize;
                waveformData.push(Math.min(1, average * 4));
            }

            await audioContext.close();
            return waveformData;
        } catch (error) {
            console.error('[useVoiceActionCreator] Failed to generate waveform:', error);
            return new Array(48).fill(0.35);
        }
    }, []);

    const stopVolumeMonitoring = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        setVolume(0);
    }, []);

    const startRecording = useCallback(async () => {
        try {
            setErrorMessage('');
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});
            streamRef.current = stream;

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm'
            });

            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.start();
            mediaRecorderRef.current = mediaRecorder;
            setState('recording');
            startVolumeMonitoring(stream);
        } catch (error) {
            console.error('[useVoiceActionCreator] Failed to start recording:', error);
            setErrorMessage('Failed to access microphone. Please check permissions.');
            setState('error');
            showToast('Failed to access microphone', 'error');
        }
    }, [showToast, startVolumeMonitoring]);

    const stopRecording = useCallback(async () => {
        if (!mediaRecorderRef.current) {
            return;
        }

        stopVolumeMonitoring();

        return new Promise<void>((resolve) => {
            const recorder = mediaRecorderRef.current!;

            recorder.onstop = async () => {
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach((track) => track.stop());
                    streamRef.current = null;
                }

                const audioBlob = new Blob(audioChunksRef.current, {type: 'audio/webm'});
                const audioBuffer = await audioBlob.arrayBuffer();
                const waveformData = await generateWaveform(audioBuffer);
                setWaveform(waveformData);

                setState('ready');
                resolve();
            };

            recorder.stop();
        });
    }, [stopVolumeMonitoring, generateWaveform]);

    const processRecording = useCallback(async () => {
        if (!config || audioChunksRef.current.length === 0) {
            return;
        }

        try {
            setState('transcribing');
            setErrorMessage('');

            abortControllerRef.current = new AbortController();

            const audioBlob = new Blob(audioChunksRef.current, {type: 'audio/webm'});
            const audioBuffer = await audioBlob.arrayBuffer();

            const transcribed = await speechBridge.transcribe(
                audioBuffer,
                {
                    mode: config.speech.mode,
                    model: config.speech.model,
                    openaiKey: config.apiKeys.openai,
                    googleKey: config.apiKeys.google,
                    accessToken: config.auth?.accessToken || config.auth?.access
                },
                {
                    mimeType: 'audio/webm',
                    fileName: 'voice-action.webm',
                    signal: abortControllerRef.current.signal
                }
            );

            if (!transcribed || transcribed.trim().length === 0) {
                throw new Error('No speech detected. Please try again.');
            }

            setTranscribedText(transcribed);
            setState('generating');

            const llmMode = config.llm.mode;
            const llmModel = config.llm.model;
            const llmService = createLLMService(llmMode, llmModel, {
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google,
                accessToken: config.auth?.accessToken || config.auth?.access
            });

            const fullPrompt = `${VOICE_ACTION_SYSTEM_PROMPT}\n\nUser's voice input: "${transcribed}"`;
            const llmResponse = await llmService.process('', fullPrompt);

            if (abortControllerRef.current?.signal.aborted) {
                throw new Error('Generation cancelled');
            }

            const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Failed to parse LLM response. Please try again.');
            }

            const actionConfig = JSON.parse(jsonMatch[0]);

            const generatedValues: Partial<ActionFormValues> = {
                name: actionConfig.name || '',
                prompt: actionConfig.prompt || '',
                promptRecognizing: actionConfig.promptRecognizing || '',
                priority: actionConfig.priority || 1,
                showResults: actionConfig.showResults ?? false,
                soundOnComplete: actionConfig.soundOnComplete ?? false,
                autoCopyResult: actionConfig.autoCopyResult ?? false
            };

            onActionGenerated(generatedValues);
            setState('idle');
            showToast('Action generated successfully!', 'success');
        } catch (error: any) {
            if (error.message === 'Generation cancelled') {
                setState('ready');
                return;
            }
            console.error('[useVoiceActionCreator] Error processing audio:', error);
            const message = error.message || 'Failed to process voice input';
            setErrorMessage(message);
            setState('error');
            showToast(message, 'error');
        } finally {
            abortControllerRef.current = null;
        }
    }, [config, onActionGenerated, showToast]);

    const cancelRecording = useCallback(() => {
        stopVolumeMonitoring();
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        audioChunksRef.current = [];
        setState('idle');
        setErrorMessage('');
        setTranscribedText('');
        setWaveform([]);
    }, [stopVolumeMonitoring]);

    const abortGeneration = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setState('ready');
    }, []);

    const reset = useCallback(() => {
        cancelRecording();
    }, [cancelRecording]);

    return {
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
        isRecording: state === 'recording',
        isReady: state === 'ready',
        isProcessing: state === 'transcribing' || state === 'generating',
        isIdle: state === 'idle',
        hasError: state === 'error'
    };
};
