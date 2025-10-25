import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LLM_MODES, SPEECH_MODES } from '@shared/constants';
import type { ActionConfig } from '@shared/types';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import MicrophoneButton from '../components/MicrophoneButton';
import ActionButton from '../components/ActionButton';
import { ApiSpeechService } from '@main/services/speech/ApiSpeechService';
import { LocalSpeechService } from '@main/services/speech/LocalSpeechService';
import type { BaseSpeechService } from '@main/services/speech/BaseSpeechService';
import { ApiLLMService } from '@main/services/llm/ApiLLMService';
import { LocalLLMService } from '@main/services/llm/LocalLLMService';
import type { BaseLLMService } from '@main/services/llm/BaseLLMService';

const MainWindow: React.FC = () => {
  const { config } = useConfig();
  const { showToast } = useToast();
  const speechServiceRef = useRef<BaseSpeechService | null>(null);
  const llmServiceRef = useRef<BaseLLMService | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [volume, setVolume] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!config) {
      return;
    }

    const accessToken = config.auth.accessToken || undefined;

    if (config.speech.mode === SPEECH_MODES.API) {
      if (speechServiceRef.current instanceof ApiSpeechService) {
        speechServiceRef.current.updateAccessToken(accessToken);
      } else {
        speechServiceRef.current = new ApiSpeechService(accessToken);
      }
    } else {
      speechServiceRef.current = new LocalSpeechService();
    }

    if (config.llm.mode === LLM_MODES.API) {
      if (llmServiceRef.current instanceof ApiLLMService) {
        llmServiceRef.current.updateAccessToken(accessToken);
      } else {
        llmServiceRef.current = new ApiLLMService(accessToken);
      }
    } else {
      llmServiceRef.current = new LocalLLMService();
    }
  }, [config]);

  const actions = useMemo<ActionConfig[]>(() => config?.actions ?? [], [config?.actions]);

  const startVolumeMonitor = (stream: MediaStream) => {
    stopVolumeMonitor();
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);

      const update = () => {
        analyser.getByteTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const deviation = buffer[i] - 128;
          sumSquares += deviation * deviation;
        }
        const rms = Math.sqrt(sumSquares / buffer.length) / 128;
        setVolume(Number.isFinite(rms) ? rms : 0);
        animationFrameRef.current = requestAnimationFrame(update);
      };

      update();
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
    } catch (error) {
      console.error('[MainWindow] Не удалось инициализировать визуализацию микрофона', error);
    }
  };

  const stopVolumeMonitor = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setVolume(0);
  };

  useEffect(() => () => {
    stopVolumeMonitor();
  }, []);

  if (!config) {
    return null;
  }

  const ensureSpeechService = () => {
    if (!speechServiceRef.current) {
      showToast('Сервис записи недоступен.', 'error');
      return false;
    }
    return true;
  };

  const ensureLLMService = () => {
    if (!llmServiceRef.current) {
      showToast('LLM сервис недоступен.', 'error');
      return false;
    }
    return true;
  };

  const finishRecording = async (): Promise<Blob | null> => {
    if (!speechServiceRef.current) {
      return null;
    }

    try {
      const blob = await speechServiceRef.current.stopRecording();
      setIsRecording(false);
      stopVolumeMonitor();
      return blob;
    } catch (error) {
      console.error(error);
      showToast('Не удалось остановить запись.', 'error');
      setIsRecording(false);
      stopVolumeMonitor();
      return null;
    }
  };

  const transcribeToClipboard = async (blob: Blob) => {
    if (!speechServiceRef.current) {
      return;
    }

    try {
      const text = await speechServiceRef.current.transcribe(blob);
      await window.winky?.clipboard.writeText(text);
      showToast('Текст скопирован.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Не удалось распознать речь.', 'error');
    }
  };

  const processAction = async (action: ActionConfig, blob: Blob) => {
    if (!ensureLLMService()) {
      return;
    }

    setProcessing(true);
    try {
      const transcription = await speechServiceRef.current?.transcribe(blob);
      if (!transcription) {
        showToast('Не удалось распознать речь для действия.', 'error');
        return;
      }

      const response = await llmServiceRef.current!.process(transcription, action.prompt);
      await window.winky?.clipboard.writeText(response);
      showToast('Ответ скопирован.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Ошибка при обработке действия.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleMicrophoneToggle = async () => {
    if (!ensureSpeechService()) {
      return;
    }

    if (!isRecording) {
      try {
        const stream = await speechServiceRef.current?.startRecording();
        setIsRecording(true);
        setActiveActionId(null);
        if (stream) {
          startVolumeMonitor(stream);
        }
      } catch (error) {
        console.error(error);
        showToast('Не удалось начать запись. Проверьте доступ к микрофону.', 'error');
      }
      return;
    }

    const blob = await finishRecording();
    setActiveActionId(null);
    if (blob) {
      await transcribeToClipboard(blob);
    }
  };

  const handleActionClick = async (action: ActionConfig) => {
    if (processing || !isRecording) {
      return;
    }

    if (!ensureSpeechService()) {
      return;
    }

    setActiveActionId(action.id);
    const blob = await finishRecording();
    if (blob) {
      await processAction(action, blob);
    }
    setActiveActionId(null);
  };

  const normalizedVolume = Math.min(volume * 2.5, 1);
  const displayedActions = isRecording ? actions : [];

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="relative flex items-center justify-center">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {[3, 2, 1].map((multiplier) => (
            <div
              key={multiplier}
              className="microphone-wave"
              style={{
                width: `${120 + multiplier * 40}px`,
                height: `${120 + multiplier * 40}px`,
                opacity: isRecording ? Math.max(0, normalizedVolume - (multiplier - 1) * 0.15) : 0,
                transform: `scale(${isRecording ? 1 + normalizedVolume * 0.6 : 0.75})`
              }}
            />
          ))}
        </div>
        <MicrophoneButton
          isRecording={isRecording}
          onToggle={handleMicrophoneToggle}
          disabled={processing}
          size={isRecording ? 'compact' : 'default'}
        />
      </div>

      {displayedActions.length > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {displayedActions.map((action, index) => {
            const angle = (360 / displayedActions.length) * index;
            const radius = 110;
            return (
              <div
                key={action.id}
                className="pointer-events-auto absolute left-1/2 top-1/2"
                style={{
                  transform: `translate(-50%, -50%) rotate(${angle}deg) translate(${radius}px) rotate(-${angle}deg)`
                }}
              >
                <ActionButton
                  action={action}
                  onClick={handleActionClick}
                  disabled={processing}
                  isActive={activeActionId === action.id}
                  variant="floating"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MainWindow;
