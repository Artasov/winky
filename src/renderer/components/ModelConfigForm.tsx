import React, { useEffect, useMemo } from 'react';
import {
  LLM_API_MODELS,
  LLM_LOCAL_MODELS,
  LLM_MODES,
  SPEECH_API_MODELS,
  SPEECH_LOCAL_MODELS,
  SPEECH_MODES
} from '@shared/constants';
import type { LLMMode, LLMModel, SpeechMode, SpeechModel } from '@shared/types';

export interface ModelConfigFormData {
  openaiKey: string;
  googleKey: string;
  speechMode: SpeechMode;
  speechModel: SpeechModel;
  llmMode: LLMMode;
  llmModel: LLMModel;
}

interface ModelConfigFormProps {
  values: ModelConfigFormData;
  onChange: (values: ModelConfigFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  submitButtonText: string;
  requireApiKeys?: boolean; // Если true, обязательно нужен хотя бы один ключ для API режима
}

const ModelConfigForm: React.FC<ModelConfigFormProps> = ({
  values,
  onChange,
  onSubmit,
  saving,
  submitButtonText,
  requireApiKeys = false
}) => {
  const formatLabel = (value: string) =>
    value
      .replace(/[:]/g, ' ')
      .replace(/-/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  const speechModelOptions = useMemo<SpeechModel[]>(() => {
    const base = values.speechMode === SPEECH_MODES.API ? SPEECH_API_MODELS : SPEECH_LOCAL_MODELS;
    return [...base] as SpeechModel[];
  }, [values.speechMode]);

  const llmModelOptions = useMemo<LLMModel[]>(() => {
    const base = values.llmMode === LLM_MODES.API ? LLM_API_MODELS : LLM_LOCAL_MODELS;
    return [...base] as LLMModel[];
  }, [values.llmMode]);

  // Автоматически переключаем модель при смене режима
  useEffect(() => {
    if (!speechModelOptions.includes(values.speechModel)) {
      onChange({
        ...values,
        speechModel: speechModelOptions[0] as SpeechModel
      });
    }
  }, [speechModelOptions, values.speechModel]);

  useEffect(() => {
    if (!llmModelOptions.includes(values.llmModel)) {
      onChange({
        ...values,
        llmModel: llmModelOptions[0] as LLMModel
      });
    }
  }, [llmModelOptions, values.llmModel]);

  const requiresOpenAIKey = values.llmMode === LLM_MODES.API;
  const requiresGoogleKey = values.speechMode === SPEECH_MODES.API;

  return (
    <form onSubmit={onSubmit} className="fc gap-6 rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
      <section className="fc gap-4">
        <h2 className="text-lg font-semibold text-text-primary">Modes and Models</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="speech-mode">
              Speech Recognition
            </label>
            <select
              id="speech-mode"
              value={values.speechMode}
              onChange={(e) => onChange({ ...values, speechMode: e.target.value as SpeechMode })}
              className="select-animated rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
            >
              <option value={SPEECH_MODES.API}>API</option>
              <option value={SPEECH_MODES.LOCAL}>Local</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="speech-model">
              Speech Model
            </label>
            <select
              id="speech-model"
              value={values.speechModel}
              onChange={(e) => onChange({ ...values, speechModel: e.target.value as SpeechModel })}
              className="select-animated rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
            >
              {speechModelOptions.map((model) => (
                <option key={model} value={model}>
                  {formatLabel(model)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="llm-mode">
              LLM Processing
            </label>
            <select
              id="llm-mode"
              value={values.llmMode}
              onChange={(e) => onChange({ ...values, llmMode: e.target.value as LLMMode })}
              className="select-animated rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
            >
              <option value={LLM_MODES.API}>API</option>
              <option value={LLM_MODES.LOCAL}>Local</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="llm-model">
              LLM Model
            </label>
            <select
              id="llm-model"
              value={values.llmModel}
              onChange={(e) => onChange({ ...values, llmModel: e.target.value as LLMModel })}
              className="select-animated rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
            >
              {llmModelOptions.map((model) => (
                <option key={model} value={model}>
                  {formatLabel(model)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="fc gap-4">
        <h2 className="text-lg font-semibold text-text-primary">API Keys</h2>
        <p className="text-sm text-text-secondary">
          {requireApiKeys && (requiresOpenAIKey || requiresGoogleKey)
            ? 'Please provide at least one API key for the selected mode(s).'
            : 'These keys are used for speech recognition (Google) and LLM processing (OpenAI). Leave empty if you plan to work in local mode.'}
        </p>

        {requiresGoogleKey && (
          <label className="flex flex-col gap-2 text-sm text-text-primary" htmlFor="google-key">
            Google AI Key {requireApiKeys && <span className="text-primary">*</span>}
            <input
              id="google-key"
              type="password"
              value={values.googleKey}
              onChange={(e) => onChange({ ...values, googleKey: e.target.value })}
              className="input-animated rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
              placeholder="AIza..."
              required={requireApiKeys && requiresGoogleKey && !requiresOpenAIKey}
            />
            {requireApiKeys && requiresOpenAIKey && (
              <span className="text-xs text-text-tertiary">
                Required for API-based speech recognition. Can be skipped if OpenAI key is provided.
              </span>
            )}
          </label>
        )}

        {requiresOpenAIKey && (
          <label className="flex flex-col gap-2 text-sm text-text-primary" htmlFor="openai-key">
            OpenAI API Key {requireApiKeys && <span className="text-primary">*</span>}
            <input
              id="openai-key"
              type="password"
              value={values.openaiKey}
              onChange={(e) => onChange({ ...values, openaiKey: e.target.value })}
              className="input-animated rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
              placeholder="sk-..."
              required={requireApiKeys && requiresOpenAIKey && !requiresGoogleKey}
            />
            {requireApiKeys && requiresGoogleKey && (
              <span className="text-xs text-text-tertiary">
                Required for API-based LLM processing. Can be skipped if Google key is provided.
              </span>
            )}
          </label>
        )}

        {!requiresGoogleKey && !requiresOpenAIKey && (
          <p className="text-sm text-text-tertiary italic">
            No API keys required for local mode.
          </p>
        )}
      </section>

      <div className="fre">
        <button
          type="submit"
          disabled={saving}
          className="button-primary rounded-lg px-8 py-3 text-base font-semibold shadow-primary-md disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {saving ? 'Saving...' : submitButtonText}
        </button>
      </div>
    </form>
  );
};

export default ModelConfigForm;

