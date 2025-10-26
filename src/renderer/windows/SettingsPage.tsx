import React, { useEffect, useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { SPEECH_MODES, LLM_MODES, SPEECH_API_MODELS, LLM_API_MODELS } from '@shared/constants';
import ModelConfigForm, { ModelConfigFormData } from '../components/ModelConfigForm';

const SettingsPage: React.FC = () => {
  const { config, updateConfig } = useConfig();
  const { user, clearUser } = useUser();
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

  const handleLogout = async () => {
    try {
      await window.winky.auth.logout();
      // Очищаем пользователя из контекста
      clearUser();
      // Config обновится автоматически через broadcastConfigUpdate
      // Перенаправление произойдет через handleNavigation в App.tsx
      showToast('Logged out successfully.', 'success');
    } catch (error) {
      console.error('[SettingsPage] Failed to logout', error);
      showToast('Failed to logout.', 'error');
    }
  };

  const isAuthorized = user !== null;

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
      <div className="frbc gap-4">
        <div className="fc gap-1">
          <h1 className="text-3xl font-semibold text-text-primary">Settings</h1>
          <p className="text-sm text-text-secondary">Manage connections to external services.</p>
        </div>
        <button
          onClick={handleLogout}
          className="button-animated frcc gap-2 rounded-lg border border-error bg-white px-4 py-2 text-sm font-medium text-error shadow-sm transition-all hover:bg-error hover:text-white focus:outline-none"
          title="Logout"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Logout
        </button>
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
