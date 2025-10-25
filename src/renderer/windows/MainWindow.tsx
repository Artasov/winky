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

  const openSettings = () => {
    void window.winky.windows.openSettings();
  };

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-200">
        Конфигурация не загружена.
      </div>
    );
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
      return blob;
    } catch (error) {
      console.error(error);
      showToast('Не удалось остановить запись.', 'error');
      setIsRecording(false);
      setActiveActionId(null);
      return null;
    }
  };

  const transcribeToClipboard = async (blob: Blob) => {
    if (!speechServiceRef.current) {
      return;
    }

    try {
      const text = await speechServiceRef.current.transcribe(blob);
      await window.winky.clipboard.writeText(text);
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
      await window.winky.clipboard.writeText(response);
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
        await speechServiceRef.current?.startRecording();
        setIsRecording(true);
        setActiveActionId(null);
        showToast('Запись началась.', 'info');
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
    if (processing) {
      showToast('Ожидается завершение предыдущего действия.', 'info');
      return;
    }

    if (!ensureSpeechService()) {
      return;
    }

    if (!isRecording) {
      try {
        await speechServiceRef.current?.startRecording();
        setIsRecording(true);
        setActiveActionId(action.id);
        showToast('Запись для действия началась. Нажмите кнопку ещё раз, чтобы завершить.', 'info');
      } catch (error) {
        console.error(error);
        showToast('Не удалось начать запись.', 'error');
      }
      return;
    }

    if (activeActionId !== action.id) {
      showToast('Сначала завершите текущую запись.', 'info');
      return;
    }

    const blob = await finishRecording();
    setActiveActionId(null);
    if (blob) {
      await processAction(action, blob);
    }
  };

  const recordingLabel = activeActionId
    ? 'Запись действия...'
    : isRecording
    ? 'Запись...' 
    : 'Нажмите, чтобы начать запись';

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="absolute right-6 top-6">
        <button
          type="button"
          onClick={openSettings}
          className="rounded-md border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/10"
        >
          Настройки
        </button>
      </div>
      <div className="text-center">
        <h1 className="text-4xl font-semibold text-white">Голосовой ассистент Winky</h1>
        <p className="mt-2 text-sm text-slate-300">{recordingLabel}</p>
      </div>
      <MicrophoneButton
        isRecording={isRecording && !activeActionId}
        onToggle={handleMicrophoneToggle}
        disabled={processing}
      />
      {actions.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          {actions.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              onClick={handleActionClick}
              disabled={processing || (isRecording && activeActionId !== null && activeActionId !== action.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MainWindow;
