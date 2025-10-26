import React, { useEffect, useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { SPEECH_MODES, LLM_MODES, SPEECH_API_MODELS, LLM_API_MODELS } from '@shared/constants';
import ModelConfigForm, { ModelConfigFormData } from '../components/ModelConfigForm';

const SettingsPage: React.FC = () => {
  const { config, updateConfig } = useConfig();
  const { user } = useUser();
  const { showToast } = useToast();
  
  const [formData, setFormData] = useState<ModelConfigFormData>({
    openaiKey: '',
    googleKey: '',
    speechMode: SPEECH_MODES.API,
    speechModel: SPEECH_API_MODELS[0],
    llmMode: LLM_MODES.API,
    llmModel: LLM_API_MODELS[0]
  });
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData({
        openaiKey: config.apiKeys.openai ?? '',
        googleKey: config.apiKeys.google ?? '',
        speechMode: config.speech.mode,
        speechModel: config.speech.model,
        llmMode: config.llm.mode,
        llmModel: config.llm.model
      });
    }
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateConfig({
        apiKeys: {
          openai: formData.openaiKey.trim(),
          google: formData.googleKey.trim()
        },
        speech: {
          mode: formData.speechMode,
          model: formData.speechModel
        },
        llm: {
          mode: formData.llmMode,
          model: formData.llmModel
        }
      });
      showToast('Settings saved successfully.', 'success');
    } catch (error) {
      console.error('[SettingsPage] Failed to save settings', error);
      showToast('Failed to save API keys.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isAuthorized = Boolean(config?.auth.accessToken);

    if (!isAuthorized) {
        return (
      <div className="fccc mx-auto h-full w-full max-w-md gap-4 px-8 py-12 text-center">
                <div className="text-4xl opacity-60">🔐</div>
                <p className="text-sm text-text-secondary">Please sign in to change settings.</p>
            </div>
        );
    }

    return (
        <div className="fc mx-auto h-full w-full max-w-4xl gap-4 px-8 py-6 overflow-y-auto">
            <div className="fc gap-1">
                <h1 className="text-3xl font-semibold text-text-primary">Settings</h1>
                <p className="text-sm text-text-secondary">Manage connections to external services.</p>
            </div>

      <ModelConfigForm
        values={formData}
        onChange={setFormData}
        onSubmit={handleSubmit}
        saving={saving}
        submitButtonText="Save"
        requireApiKeys={false}
      />
        </div>
    );
};

export default SettingsPage;
