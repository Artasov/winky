import React, {ChangeEvent, useEffect, useState} from 'react';
import classNames from 'classnames';
import {useConfig} from '../context/ConfigContext';
import {useUser} from '../context/UserContext';
import {useToast} from '../context/ToastContext';
import {LLM_API_MODELS, LLM_MODES, SPEECH_API_MODELS, SPEECH_MODES} from '@shared/constants';
import type {MicAnchor} from '@shared/types';
import ModelConfigForm, {ModelConfigFormData} from '../components/ModelConfigForm';
import HotkeyInput from '../components/HotkeyInput';

const SettingsPage: React.FC = () => {
    const {config, updateConfig} = useConfig();
    const {user} = useUser();
    const {showToast} = useToast();

    const [formData, setFormData] = useState<ModelConfigFormData>({
        openaiKey: '',
        googleKey: '',
        speechMode: SPEECH_MODES.API,
        speechModel: SPEECH_API_MODELS[0],
        llmMode: LLM_MODES.API,
        llmModel: LLM_API_MODELS[0]
    });

    const [saving, setSaving] = useState(false);
    const [micHotkey, setMicHotkey] = useState('');
    const [micAnchor, setMicAnchor] = useState<MicAnchor>('bottom-right');
    const [micAutoStart, setMicAutoStart] = useState(false);

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
            setMicHotkey(config.micHotkey ?? '');
            setMicAnchor((config.micAnchor as MicAnchor) ?? 'bottom-right');
            setMicAutoStart(Boolean(config.micAutoStartRecording));
        }
    }, [config]);

    useEffect(() => {
        const handleHotkeyError = (_event: unknown, payload: {
            source?: string;
            accelerator?: string;
            message?: string;
            reason?: string
        }) => {
            if (!payload || payload.source !== 'mic') {
                return;
            }
            const humanAccelerator = payload.accelerator ? ` "${payload.accelerator}"` : '';
            let message = payload.message;
            if (!message) {
                switch (payload.reason) {
                    case 'invalid':
                        message = `Shortcut${humanAccelerator} could not be parsed. Please try a different combination.`;
                        break;
                    case 'register-failed':
                        message = `Shortcut${humanAccelerator} is not available on this platform. Try another key combo.`;
                        break;
                    default:
                        message = `Failed to register shortcut${humanAccelerator}. Try another key combo.`;
                }
            }
            showToast(message, 'error');
        };

        const handleHotkeySuccess = (_event: unknown, payload: { source?: string; accelerator?: string }) => {
            if (!payload || payload.source !== 'mic') {
                return;
            }
            if (payload.accelerator) {
                showToast(`Hotkey ready: ${payload.accelerator}`, 'success');
            }
        };

        const electronApi = (window as any).electron;
        electronApi?.on?.('hotkey:register-error', handleHotkeyError);
        electronApi?.on?.('hotkey:register-success', handleHotkeySuccess);

        return () => {
            electronApi?.removeListener?.('hotkey:register-error', handleHotkeyError);
            electronApi?.removeListener?.('hotkey:register-success', handleHotkeySuccess);
        };
    }, [showToast]);

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

    const handleAnchorSelect = async (anchor: MicAnchor) => {
        setMicAnchor(anchor);
        try {
            const position = await window.winky?.mic?.setAnchor(anchor);
            if (position) {
                showToast(`Mic docked to ${anchor.replace('-', ' ')} (${position.x}, ${position.y})`, 'success');
            }
        } catch (error) {
            console.error('[SettingsPage] Failed to set mic anchor', error);
            showToast('Failed to move microphone. Try again.', 'error');
        }
    };

    const anchorOptions: { value: MicAnchor; label: string }[] = [
        {value: 'top-left', label: 'Top Left'},
        {value: 'top-right', label: 'Top Right'},
        {value: 'bottom-left', label: 'Bottom Left'},
        {value: 'bottom-right', label: 'Bottom Right'}
    ];

    const handleHotkeyChange = async (nextValue: string) => {
        setMicHotkey(nextValue);
        try {
            await updateConfig({micHotkey: nextValue.trim()});
            showToast(nextValue ? `Hotkey set to ${nextValue}` : 'Hotkey cleared.', 'success');
        } catch (error) {
            console.error('[SettingsPage] Failed to update hotkey', error);
            showToast('Failed to update hotkey.', 'error');
        }
    };

    const handleHotkeyInvalid = (reason: 'non-english' | 'modifier-only') => {
        if (reason === 'non-english') {
            showToast('Please switch to English layout for shortcuts.', 'error');
        }
        showToast('Please include a non-modifier key in the shortcut.', 'info');
    };

    const handleAutoStartChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.checked;
        const previousValue = micAutoStart;
        setMicAutoStart(nextValue);
        try {
            await updateConfig({micAutoStartRecording: nextValue});
            showToast(
                nextValue
                    ? 'Recording starts automatically when the mic overlay opens.'
                    : 'Automatic recording on overlay show disabled.',
                'success'
            );
        } catch (error) {
            console.error('[SettingsPage] Failed to update mic auto start', error);
            setMicAutoStart(previousValue);
            showToast('Failed to update microphone behaviour.', 'error');
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

            <section
                className="mt-6 flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white p-6 shadow-primary-sm">
                <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold text-text-primary">Mic Overlay</h2>
                    <p className="text-xs text-text-secondary">Configure the floating microphone overlay behaviour.</p>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-text-primary">Toggle Hotkey</label>
                    <HotkeyInput
                        value={micHotkey}
                        onChange={handleHotkeyChange}
                        onInvalid={handleHotkeyInvalid}
                        placeholder="Press keys to set shortcut"
                    />
                    <p className="text-xs text-text-tertiary">Press the desired key combination. Press Escape or use
                        Clear to remove the shortcut.</p>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-text-primary">Default Position</label>
                    <div className="grid grid-cols-2 gap-2">
                        {anchorOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => handleAnchorSelect(option.value)}
                                className={classNames(
                                    'rounded-lg border px-3 py-2 text-sm transition-colors',
                                    micAnchor === option.value
                                        ? 'border-primary bg-primary-50 text-primary'
                                        : 'border-primary-200 bg-white text-text-secondary hover:border-primary hover:text-primary'
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-text-tertiary">Select one of the corners to dock the microphone overlay.
                        The overlay moves immediately.</p>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
                        <input
                            type="checkbox"
                            checked={micAutoStart}
                            onChange={handleAutoStartChange}
                            className="h-4 w-4 rounded border border-primary-200 text-primary focus:ring-primary"
                        />
                        Start recording automatically
                    </label>
                    <p className="text-xs text-text-tertiary">
                        When enabled, showing the mic via hotkey or taskbar menu immediately begins recording.
                    </p>
                </div>

            </section>
        </div>
    );
};

export default SettingsPage;
