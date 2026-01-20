import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
    LLM_API_MODELS,
    LLM_GEMINI_API_MODELS,
    LLM_MODES,
    LLM_OPENAI_API_MODELS,
    SPEECH_API_MODELS,
    SPEECH_GOOGLE_API_MODELS,
    SPEECH_MODES,
    SPEECH_OPENAI_API_MODELS
} from '@shared/constants';
import {useConfig} from '../context/ConfigContext';
import {useToast} from '../context/ToastContext';
import TitleBar from '../components/TitleBar';
import ModelConfigForm, {ModelConfigFormData} from '../components/ModelConfigForm';

const isGoogleAiApiModel = (model: string): boolean =>
    (LLM_GEMINI_API_MODELS as readonly string[]).includes(model as string);

const isOpenAiApiModel = (model: string): boolean =>
    (LLM_OPENAI_API_MODELS as readonly string[]).includes(model as string);

const isGoogleTranscribeModel = (model: string): boolean =>
    (SPEECH_GOOGLE_API_MODELS as readonly string[]).includes(model as string);

const isOpenAiTranscribeModel = (model: string): boolean =>
    (SPEECH_OPENAI_API_MODELS as readonly string[]).includes(model as string);

const SetupWindow: React.FC = () => {
    const {config, updateConfig} = useConfig();
    const {showToast} = useToast();
    const navigate = useNavigate();

    const [formData, setFormData] = useState<ModelConfigFormData>({
        openaiKey: config?.apiKeys.openai ?? '',
        googleKey: config?.apiKeys.google ?? '',
        transcribeMode: config?.speech.mode ?? SPEECH_MODES.API,
        transcribeModel: config?.speech.model ?? SPEECH_API_MODELS[0],
        llmMode: config?.llm.mode ?? LLM_MODES.API,
        llmModel: config?.llm.model ?? LLM_API_MODELS[0],
        globalTranscribePrompt: config?.globalTranscribePrompt ?? '',
        globalLlmPrompt: config?.globalLlmPrompt ?? ''
    });

    const [saving, setSaving] = useState(false);
    const bothLocalModes =
        formData.transcribeMode === SPEECH_MODES.LOCAL && formData.llmMode === LLM_MODES.LOCAL;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const transcribeIsApi = formData.transcribeMode === SPEECH_MODES.API;
        const requiresOpenAiTranscribeKey = transcribeIsApi && isOpenAiTranscribeModel(formData.transcribeModel);
        const requiresGoogleTranscribeKey = transcribeIsApi && isGoogleTranscribeModel(formData.transcribeModel);
        const requiresOpenAiLlmKey = formData.llmMode === LLM_MODES.API && isOpenAiApiModel(formData.llmModel);
        const requiresGoogleAiLlmKey = formData.llmMode === LLM_MODES.API && isGoogleAiApiModel(formData.llmModel);
        const needsOpenAiKey = requiresOpenAiTranscribeKey || requiresOpenAiLlmKey;
        const needsGoogleKey = requiresGoogleTranscribeKey || requiresGoogleAiLlmKey;

        // Если выбрана модель без ключа - предлагаем переключиться на Local или добавить ключ
        if (needsOpenAiKey && !formData.openaiKey.trim()) {
            const hasGoogleKey = !!formData.googleKey.trim();
            const message = hasGoogleKey
                ? 'OpenAI key is missing. Switch to Local mode or Google models, or add OpenAI key.'
                : 'OpenAI key is missing. Switch to Local mode or add OpenAI key.';
            showToast(message, 'info', {durationMs: 8000});
            return;
        }

        if (needsGoogleKey && !formData.googleKey.trim()) {
            const hasOpenAiKey = !!formData.openaiKey.trim();
            const message = hasOpenAiKey
                ? 'Google key is missing. Switch to Local mode or OpenAI models, or add Google key.'
                : 'Google key is missing. Switch to Local mode or add Google key.';
            showToast(message, 'info', {durationMs: 8000});
            return;
        }

        setSaving(true);
        try {
            await updateConfig({
                setupCompleted: true,
                speech: {mode: formData.transcribeMode, model: formData.transcribeModel},
                llm: {mode: formData.llmMode, model: formData.llmModel},
                apiKeys: {
                    openai: formData.openaiKey.trim(),
                    google: formData.googleKey.trim()
                }
            });
            showToast('Settings saved successfully', 'success');
            navigate('/info');
        } catch (error) {
            console.error(error);
            showToast('Failed to save settings.', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (!config) {
        return (
            <div className="flex h-full flex-col">
                <TitleBar/>
                <div className="flex flex-1 items-center justify-center bg-bg-base text-text-primary">
                    <div className="animate-pulse-soft">Configuration not loaded.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <TitleBar/>
            <div className="flex-1 overflow-auto">
                <div className="mx-auto w-full max-w-4xl flex flex-col gap-6 px-6 py-10">
                    <div>
                        <h2 className="text-3xl font-semibold text-text-primary">Initial Setup</h2>
                        <p className="mt-2 text-sm text-text-secondary">
                            Configure your speech recognition and LLM processing modes, then provide API keys.
                        </p>
                    </div>

                    <ModelConfigForm
                        values={formData}
                        onChange={setFormData}
                        onSubmit={handleSubmit}
                        submitButtonText="Complete Setup"
                        saving={saving}
                        requireApiKeys={!bothLocalModes}
                    />
                </div>
            </div>
        </div>
    );
};

export default SetupWindow;
