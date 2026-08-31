import {useCallback, useEffect, useRef, useState} from 'react';
import type {AppConfig} from '@shared/types';
import {speechBridge} from '../../../winkyBridge/speechBridge';
import {createLLMService} from '../../../services/llm/factory';
import {
    createSpeechRecorder,
    isSpeechRecorderAbortError,
    type SpeechRecorder
} from '../../microphone/services/SpeechRecorder';
import {VOICE_ACTION_SYSTEM_PROMPT} from '../prompts/voiceActionPrompt';
import type {ActionFormValues} from './useActionForm';

type UseVoiceActionCreatorParams = {
    config: AppConfig | null;
    showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
    onActionGenerated: (values: Partial<ActionFormValues>) => void;
};

type RecordingState =
    | 'idle'
    | 'starting'
    | 'recording'
    | 'stopping'
    | 'ready'
    | 'transcribing'
    | 'generating'
    | 'error';

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error || 'Failed to process voice input');
};

const getDiagnosticStatus = (error: unknown, fallback: string): string | number => {
    if (typeof error === 'object' && error !== null && 'response' in error) {
        const response = error.response;
        if (typeof response === 'object' && response !== null && 'status' in response) {
            const status = response.status;
            if (typeof status === 'number' || typeof status === 'string') return status;
        }
    }
    if (error instanceof Error && error.name) return error.name;
    return fallback;
};

const getProvider = (mode: string, model: string): string => {
    if (mode === 'local') return 'local';
    if (model.startsWith('winky-')) return 'winky';
    if (model.startsWith('gemini-')) return 'google';
    return 'openai';
};

const runWithAbort = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => {
    if (signal.aborted) return Promise.reject(new DOMException('Operation cancelled.', 'AbortError'));

    return new Promise<T>((resolve, reject) => {
        const handleAbort = () => reject(new DOMException('Operation cancelled.', 'AbortError'));
        signal.addEventListener('abort', handleAbort, {once: true});
        promise.then(
            (value) => {
                signal.removeEventListener('abort', handleAbort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener('abort', handleAbort);
                reject(error);
            }
        );
    });
};

export const useVoiceActionCreator = ({
    config,
    showToast,
    onActionGenerated
}: UseVoiceActionCreatorParams) => {
    const [state, setState] = useState<RecordingState>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [transcribedText, setTranscribedText] = useState('');
    const [volume, setVolume] = useState(0);
    const [waveform, setWaveform] = useState<number[]>([]);
    const recorderRef = useRef<SpeechRecorder | null>(null);
    const recordedBlobRef = useRef<Blob | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const operationIdRef = useRef(0);
    const mountedRef = useRef(true);

    const stopVolumeMonitoring = useCallback(() => {
        if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        if (mountedRef.current) setVolume(0);
    }, []);

    const startVolumeMonitoring = useCallback((stream: MediaStream) => {
        stopVolumeMonitoring();
        try {
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            audioContext.createMediaStreamSource(stream).connect(analyser);
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const buffer = new Uint8Array(analyser.fftSize);
            let lastSampleTime = 0;
            const updateVolume = () => {
                if (!mountedRef.current || analyserRef.current !== analyser) return;

                const now = performance.now();
                if (now - lastSampleTime >= 40) {
                    lastSampleTime = now;
                    analyser.getByteTimeDomainData(buffer);
                    let sumSquares = 0;
                    for (const sample of buffer) {
                        const deviation = sample - 128;
                        sumSquares += deviation * deviation;
                    }
                    const rms = Math.sqrt(sumSquares / Math.max(1, buffer.length)) / 128;
                    setVolume(Number.isFinite(rms) ? rms : 0);
                }
                animationFrameRef.current = requestAnimationFrame(updateVolume);
            };
            updateVolume();
        } catch (error) {
            console.error('[useVoiceActionCreator] Failed to start volume monitoring', {
                status: getDiagnosticStatus(error, 'volume-monitor-failed')
            });
        }
    }, [stopVolumeMonitoring]);

    const generateWaveform = useCallback(async (audioData: ArrayBuffer): Promise<number[]> => {
        const audioContext = new AudioContext();
        try {
            const decoded = await audioContext.decodeAudioData(audioData.slice(0));
            const samples = 48;
            const blockSize = Math.max(1, Math.floor(decoded.length / samples));
            const waveformData: number[] = [];

            for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
                const start = blockSize * sampleIndex;
                const end = Math.min(decoded.length, start + blockSize);
                let sum = 0;
                let count = 0;
                for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
                    const channelData = decoded.getChannelData(channel);
                    for (let frame = start; frame < end; frame += 1) {
                        sum += Math.abs(channelData[frame] ?? 0);
                        count += 1;
                    }
                }
                waveformData.push(Math.min(1, (sum / Math.max(1, count)) * 4));
            }
            return waveformData;
        } catch (error) {
            console.error('[useVoiceActionCreator] Failed to generate waveform', {
                status: getDiagnosticStatus(error, 'waveform-failed'),
                sizeBytes: audioData.byteLength
            });
            return new Array(48).fill(0.35);
        } finally {
            await audioContext.close().catch(() => {});
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const recorder = createSpeechRecorder(config?.selectedMicrophoneId, {
            onStateChange: (recorderState) => {
                if (!mountedRef.current) return;
                if (recorderState === 'starting' || recorderState === 'recording' || recorderState === 'stopping') {
                    setState(recorderState);
                }
                if (recorderState === 'idle') stopVolumeMonitoring();
            },
            onError: (error) => {
                if (!mountedRef.current) return;
                stopVolumeMonitoring();
                setErrorMessage(error.message);
                setState('error');
                showToast(error.message, 'error');
            }
        });
        recorderRef.current = recorder;
        setState('idle');
        stopVolumeMonitoring();

        return () => {
            operationIdRef.current += 1;
            abortControllerRef.current?.abort();
            recorder.dispose();
            if (recorderRef.current === recorder) recorderRef.current = null;
            recordedBlobRef.current = null;
            stopVolumeMonitoring();
        };
    }, [config?.selectedMicrophoneId, showToast, stopVolumeMonitoring]);

    const startRecording = useCallback(async () => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.getState() === 'starting' || recorder.getState() === 'recording') return;
        if (recorder.getState() === 'stopping') return;

        const operationId = ++operationIdRef.current;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        recordedBlobRef.current = null;
        setErrorMessage('');
        setTranscribedText('');
        setWaveform([]);

        try {
            const stream = await recorder.startRecording();
            if (operationId !== operationIdRef.current || recorder !== recorderRef.current) {
                recorder.cancelRecording();
                return;
            }
            startVolumeMonitoring(stream);
        } catch (error) {
            if (isSpeechRecorderAbortError(error) || operationId !== operationIdRef.current) return;
            const message = getErrorMessage(error);
            console.error('[useVoiceActionCreator] Failed to start recording', {
                provider: 'microphone',
                model: 'system',
                status: getDiagnosticStatus(error, 'start-failed')
            });
            setErrorMessage('Failed to access microphone. Please check permissions.');
            setState('error');
            showToast(message || 'Failed to access microphone', 'error');
        }
    }, [showToast, startVolumeMonitoring]);

    const stopRecording = useCallback(async () => {
        const recorder = recorderRef.current;
        if (!recorder) return;
        if (recorder.getState() === 'starting') {
            operationIdRef.current += 1;
            recorder.cancelRecording();
            setState('idle');
            return;
        }
        if (recorder.getState() !== 'recording' && recorder.getState() !== 'stopping') return;

        const operationId = operationIdRef.current;
        stopVolumeMonitoring();
        try {
            const audioBlob = await recorder.stopRecording();
            if (operationId !== operationIdRef.current || recorder !== recorderRef.current) return;
            recordedBlobRef.current = audioBlob;
            const waveformData = await generateWaveform(await audioBlob.arrayBuffer());
            if (operationId !== operationIdRef.current || !mountedRef.current) return;
            setWaveform(waveformData);
            setState('ready');
        } catch (error) {
            if (isSpeechRecorderAbortError(error) || operationId !== operationIdRef.current) return;
            const message = getErrorMessage(error);
            console.error('[useVoiceActionCreator] Failed to stop recording', {
                provider: 'microphone',
                model: 'system',
                status: getDiagnosticStatus(error, 'stop-failed')
            });
            setErrorMessage(message);
            setState('error');
            showToast(message, 'error');
        }
    }, [generateWaveform, showToast, stopVolumeMonitoring]);

    const processRecording = useCallback(async () => {
        const audioBlob = recordedBlobRef.current;
        if (!config || !audioBlob) return;

        const operationId = ++operationIdRef.current;
        const startedAt = Date.now();
        const abortController = new AbortController();
        abortControllerRef.current?.abort();
        abortControllerRef.current = abortController;

        try {
            setState('transcribing');
            setErrorMessage('');
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
                    mimeType: audioBlob.type || 'audio/webm',
                    signal: abortController.signal
                }
            );

            if (abortController.signal.aborted || operationId !== operationIdRef.current) {
                throw new DOMException('Operation cancelled.', 'AbortError');
            }
            if (!transcribed?.trim()) throw new Error('No speech detected. Please try again.');

            setTranscribedText(transcribed);
            setState('generating');

            const llmService = createLLMService(config.llm.mode, config.llm.model, {
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google,
                accessToken: config.auth?.accessToken || config.auth?.access
            });
            const fullPrompt = `${VOICE_ACTION_SYSTEM_PROMPT}\n\nUser's voice input: "${transcribed}"`;
            const llmPromise = llmService.processStream
                ? llmService.processStream('', fullPrompt, () => {}, {signal: abortController.signal})
                : llmService.process('', fullPrompt);
            const llmResponse = await runWithAbort(llmPromise, abortController.signal);

            if (abortController.signal.aborted || operationId !== operationIdRef.current) {
                throw new DOMException('Operation cancelled.', 'AbortError');
            }

            const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Failed to parse LLM response. Please try again.');
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
        } catch (error) {
            if (isSpeechRecorderAbortError(error) || abortController.signal.aborted) {
                if (operationId === operationIdRef.current && mountedRef.current) setState('ready');
                return;
            }
            if (operationId !== operationIdRef.current || !mountedRef.current) return;
            const message = getErrorMessage(error);
            console.error('[useVoiceActionCreator] Error processing audio', {
                provider: [
                    getProvider(config.speech.mode, config.speech.model),
                    getProvider(config.llm.mode, config.llm.model)
                ].join('/'),
                model: [config.speech.model, config.llm.model].join('/'),
                status: getDiagnosticStatus(error, 'failed'),
                durationMs: Date.now() - startedAt,
                sizeBytes: audioBlob.size
            });
            setErrorMessage(message);
            setState('error');
            showToast(message, 'error');
        } finally {
            if (abortControllerRef.current === abortController) abortControllerRef.current = null;
        }
    }, [config, onActionGenerated, showToast]);

    const cancelRecording = useCallback(() => {
        operationIdRef.current += 1;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        recorderRef.current?.cancelRecording();
        stopVolumeMonitoring();
        recordedBlobRef.current = null;
        setState('idle');
        setErrorMessage('');
        setTranscribedText('');
        setWaveform([]);
    }, [stopVolumeMonitoring]);

    const abortGeneration = useCallback(() => {
        operationIdRef.current += 1;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        if (recordedBlobRef.current) setState('ready');
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
        isRecording: state === 'starting' || state === 'recording' || state === 'stopping',
        isReady: state === 'ready',
        isProcessing: state === 'transcribing' || state === 'generating',
        isIdle: state === 'idle',
        hasError: state === 'error'
    };
};
