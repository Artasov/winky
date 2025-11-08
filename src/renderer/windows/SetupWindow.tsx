import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {LLM_API_MODELS, LLM_MODES, SPEECH_API_MODELS, SPEECH_MODES} from '@shared/constants';
import {useConfig} from '../context/ConfigContext';
import {useToast} from '../context/ToastContext';
import TitleBar from '../components/TitleBar';
import ModelConfigForm, {ModelConfigFormData} from '../components/ModelConfigForm';

const SetupWindow: React.FC = () => {
    const {config, updateConfig} = useConfig();
    const {showToast} = useToast();
    const navigate = useNavigate();

    const [formData, setFormData] = useState<ModelConfigFormData>({
        openaiKey: config?.apiKeys.openai ?? '',
        googleKey: config?.apiKeys.google ?? '',
        speechMode: config?.speech.mode ?? SPEECH_MODES.API,
        speechModel: config?.speech.model ?? SPEECH_API_MODELS[0],
        llmMode: config?.llm.mode ?? LLM_MODES.API,
        llmModel: config?.llm.model ?? LLM_API_MODELS[0]
    });

    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Валидация: если выбран API режим, нужен хотя бы один ключ
        const requiresOpenAI = formData.llmMode === LLM_MODES.API;
        const requiresGoogle = formData.speechMode === SPEECH_MODES.API;

        if ((requiresOpenAI || requiresGoogle) && !formData.openaiKey.trim() && !formData.googleKey.trim()) {
            showToast('Please provide at least one API key (OpenAI or Google) for API mode.', 'error');
            return;
        }

        if (requiresOpenAI && !requiresGoogle && !formData.openaiKey.trim()) {
            showToast('OpenAI API Key is required for API-based LLM processing.', 'error');
            return;
        }

        if (requiresGoogle && !requiresOpenAI && !formData.googleKey.trim()) {
            showToast('Google API Key is required for API-based speech recognition.', 'error');
            return;
        }

        setSaving(true);
        try {
            const updated = await updateConfig({
                setupCompleted: true,
                speech: {mode: formData.speechMode, model: formData.speechModel},
                llm: {mode: formData.llmMode, model: formData.llmModel},
                apiKeys: {openai: formData.openaiKey.trim(), google: formData.googleKey.trim()}
            });
            showToast('Settings saved successfully', 'success');
            // Actions будут загружены автоматически при навигации на /main, если пользователь авторизован
            navigate('/actions');
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
                        requireApiKeys={true}
                    />
                </div>
            </div>
        </div>
    );
};

export default SetupWindow;
