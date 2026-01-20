import React, {ChangeEvent, useEffect, useRef, useState} from 'react';
import {Box, Button, Checkbox, FormControlLabel, MenuItem, Slider, TextField, Typography} from '@mui/material';
import {useConfig} from '../context/ConfigContext';
import {useToast} from '../context/ToastContext';
import {LLM_API_MODELS, LLM_MODES, SPEECH_API_MODELS, SPEECH_MODES} from '@shared/constants';
import ModelConfigForm, {ModelConfigFormData} from '../components/ModelConfigForm';
import HotkeyInput from '../components/HotkeyInput';
import theme from "@renderer/theme/muiTheme";

const DEFAULT_MIC_HOTKEY = 'Alt+Q';

const SettingsPage: React.FC = () => {
    const {config, updateConfig} = useConfig();
    const {showToast} = useToast();

    const [formData, setFormData] = useState<ModelConfigFormData>({
        openaiKey: '',
        googleKey: '',
        transcribeMode: SPEECH_MODES.API,
        transcribeModel: SPEECH_API_MODELS[0],
        llmMode: LLM_MODES.API,
        llmModel: LLM_API_MODELS[0],
        globalTranscribePrompt: '',
        globalLlmPrompt: ''
    });

    const [saving, setSaving] = useState(false);
    const [micHotkey, setMicHotkey] = useState(DEFAULT_MIC_HOTKEY);
    const [micAutoStart, setMicAutoStart] = useState(true);
    const [micHideOnStop, setMicHideOnStop] = useState(true);
    const [micShowOnLaunch, setMicShowOnLaunch] = useState(false);
    const [launchOnSystemStartup, setLaunchOnSystemStartup] = useState(false);
    const [autoStartLocalSpeech, setAutoStartLocalSpeech] = useState(false);
    const [completionSoundEnabled, setCompletionSoundEnabled] = useState(true);
    const [completionSoundVolume, setCompletionSoundVolume] = useState(1.0);
    const [showAvatarVideo, setShowAvatarVideo] = useState(true);
    const [saveAudioHistory, setSaveAudioHistory] = useState(false);
    const [trimSilenceOnActions, setTrimSilenceOnActions] = useState(false);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

    useEffect(() => {
        if (config) {
            setFormData({
                openaiKey: config.apiKeys.openai ?? '',
                googleKey: config.apiKeys.google ?? '',
                transcribeMode: config.speech.mode,
                transcribeModel: config.speech.model,
                llmMode: config.llm.mode,
                llmModel: config.llm.model,
                globalTranscribePrompt: config.globalTranscribePrompt ?? '',
                globalLlmPrompt: config.globalLlmPrompt ?? ''
            });
            setMicHotkey(config.micHotkey && config.micHotkey.trim().length > 0 ? config.micHotkey : DEFAULT_MIC_HOTKEY);
            setMicAutoStart(config.micAutoStartRecording !== false);
            setMicHideOnStop(config.micHideOnStopRecording ?? true);
            setMicShowOnLaunch(config.micShowOnLaunch === true);
            setCompletionSoundEnabled(config.completionSoundEnabled !== false);
            setCompletionSoundVolume(config.completionSoundVolume ?? 1.0);
            setLaunchOnSystemStartup(Boolean(config.launchOnSystemStartup));
            setAutoStartLocalSpeech(Boolean(config.autoStartLocalSpeechServer));
            setShowAvatarVideo(config.showAvatarVideo !== false);
            setSaveAudioHistory(Boolean(config.saveAudioHistory));
            setTrimSilenceOnActions(Boolean(config.trimSilenceOnActions));
        }
    }, [config]);

    useEffect(() => {
        const loadAudioDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(device => device.kind === 'audioinput');
                setAudioDevices(audioInputs);
            } catch (error) {
                console.error('[SettingsPage] Failed to enumerate audio devices', error);
            }
        };

        void loadAudioDevices();

        const handleDeviceChange = () => {
            void loadAudioDevices();
        };

        navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
        };
    }, []);

    const previousHotkeyRef = useRef<string | null>(null);
    const isInitialMountRef = useRef(true);
    const isUserChangingHotkeyRef = useRef(false);

    // Отслеживаем изменения хоткея из конфига
    useEffect(() => {
        if (config?.micHotkey) {
            const currentHotkey = config.micHotkey.trim();
            const previousHotkey = previousHotkeyRef.current;

            // Если это первое монтирование, просто сохраняем
            if (isInitialMountRef.current) {
                isInitialMountRef.current = false;
                previousHotkeyRef.current = currentHotkey;
                return;
            }

            // Если хоткей изменился не из-за пользователя (например, при изменении модели),
            // обновляем ref, но не показываем уведомление
            if (previousHotkey !== currentHotkey && !isUserChangingHotkeyRef.current) {
                previousHotkeyRef.current = currentHotkey;
            }
        } else {
            previousHotkeyRef.current = null;
        }
    }, [config?.micHotkey]);

    useEffect(() => {
        const handleHotkeyError = (payload: {
            source?: string;
            accelerator?: string;
            message?: string;
            reason?: string;
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

        const handleHotkeySuccess = (payload: { source?: string; accelerator?: string }) => {
            if (!payload || payload.source !== 'mic') {
                return;
            }
            if (payload.accelerator) {
                const currentHotkey = payload.accelerator.trim();
                const previousHotkey = previousHotkeyRef.current;

                // Показываем уведомление только если:
                // 1. Хоткей действительно изменился
                // 2. Это изменение было инициировано пользователем (не автоматическое обновление конфига)
                if (previousHotkey !== currentHotkey && isUserChangingHotkeyRef.current) {
                    previousHotkeyRef.current = currentHotkey;
                    showToast(`Hotkey ready: ${currentHotkey}`, 'success');
                } else if (previousHotkey !== currentHotkey) {
                    // Хоткей изменился, но не из-за пользователя - просто обновляем ref
                    previousHotkeyRef.current = currentHotkey;
                }
            }
        };

        const handleHotkeyCleared = (payload: { source?: string }) => {
            if (!payload || payload.source !== 'mic') {
                return;
            }
            // Показываем уведомление только если очистка была инициирована пользователем
            if (isUserChangingHotkeyRef.current && previousHotkeyRef.current !== null) {
                previousHotkeyRef.current = null;
                showToast('Hotkey cleared.', 'success');
            } else if (previousHotkeyRef.current !== null) {
                // Хоткей очищен, но не из-за пользователя - просто обновляем ref
                previousHotkeyRef.current = null;
            }
        };

        const unsubscribeError = window.winky?.on?.('hotkey:register-error', handleHotkeyError as any);
        const unsubscribeSuccess = window.winky?.on?.('hotkey:register-success', handleHotkeySuccess as any);
        const unsubscribeCleared = window.winky?.on?.('hotkey:register-cleared', handleHotkeyCleared as any);

        return () => {
            unsubscribeError?.();
            unsubscribeSuccess?.();
            unsubscribeCleared?.();
        };
    }, [showToast]);

    const persistModelConfig = async (nextValues: ModelConfigFormData) => {
        setSaving(true);
        try {
            await updateConfig({
                apiKeys: {
                    openai: nextValues.openaiKey.trim(),
                    google: nextValues.googleKey.trim()
                },
                speech: {
                    mode: nextValues.transcribeMode,
                    model: nextValues.transcribeModel
                },
                llm: {
                    mode: nextValues.llmMode,
                    model: nextValues.llmModel
                },
                globalTranscribePrompt: nextValues.globalTranscribePrompt.trim(),
                globalLlmPrompt: nextValues.globalLlmPrompt.trim()
            });
        } catch (error) {
            console.error('[SettingsPage] Failed to save model config', error);
            showToast('Failed to update model config.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleHotkeyChange = async (nextValue: string) => {
        isUserChangingHotkeyRef.current = true;
        setMicHotkey(nextValue);
        try {
            await updateConfig({micHotkey: nextValue.trim()});
            // Сбрасываем флаг после небольшой задержки, чтобы событие успело обработаться
            setTimeout(() => {
                isUserChangingHotkeyRef.current = false;
            }, 100);
            // Уведомление показывается в handleHotkeySuccess после успешной регистрации хоткея
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

    const handleVolumeChange = (_event: Event, value: number | number[]) => {
        const nextValue = Array.isArray(value) ? value[0] : value;
        setCompletionSoundVolume(nextValue);
    };

    const handleCompletionSoundToggle = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.checked;
        const previousValue = completionSoundEnabled;
        setCompletionSoundEnabled(nextValue);
        try {
            await updateConfig({completionSoundEnabled: nextValue});
            showToast(
                nextValue ? 'Completion sound enabled.' : 'Completion sound disabled.',
                'success'
            );
        } catch (error) {
            console.error('[SettingsPage] Failed to toggle completion sound', error);
            setCompletionSoundEnabled(previousValue);
            showToast('Failed to update completion sound settings.', 'error');
        }
    };

    const handleVolumeSave = async (_event?: Event | React.SyntheticEvent, value?: number | number[]) => {
        const resolvedValue = value !== undefined ? (Array.isArray(value) ? value[0] : value) : completionSoundVolume;
        if (value !== undefined) {
            setCompletionSoundVolume(resolvedValue);
        }
        try {
            await updateConfig({completionSoundVolume: resolvedValue});
            if (resolvedValue === 0) {
                showToast('Completion sound disabled.', 'success');
            } else {
                showToast(
                    `Completion sound volume set to ${Math.round(resolvedValue * 100)}%.`,
                    'success', //{durationMs: 3333333}
                );
            }
        } catch (error) {
            console.error('[SettingsPage] Failed to update completion sound volume', error);
            showToast('Failed to update volume.', 'error');
        }
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

    const handleHideOnStopChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.checked;
        const previousValue = micHideOnStop;
        setMicHideOnStop(nextValue);
        try {
            await updateConfig({micHideOnStopRecording: nextValue});
            showToast(
                nextValue
                    ? 'Mic overlay will hide when recording stops.'
                    : 'Mic overlay will stay visible when recording stops.',
                'success'
            );
        } catch (error) {
            console.error('[SettingsPage] Failed to update mic hide on stop', error);
            setMicHideOnStop(previousValue);
            showToast('Failed to update microphone behaviour.', 'error');
        }
    };

    const handleShowOnLaunchChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.checked;
        const previousValue = micShowOnLaunch;
        setMicShowOnLaunch(nextValue);
        try {
            await updateConfig({micShowOnLaunch: nextValue});
            showToast(
                nextValue
                    ? 'Mic overlay will appear automatically when the app starts.'
                    : 'Mic overlay will stay hidden until you open it manually.',
                'success'
            );
        } catch (error) {
            console.error('[SettingsPage] Failed to update mic show on launch', error);
            setMicShowOnLaunch(previousValue);
            showToast('Failed to update microphone behaviour.', 'error');
        }
    };

    const hasToken = config?.auth.access || config?.auth.accessToken;
    const isAuthorized = Boolean(hasToken);

    const handleLaunchOnStartupChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.checked;
        const previousValue = launchOnSystemStartup;
        setLaunchOnSystemStartup(nextValue);
        try {
            await updateConfig({launchOnSystemStartup: nextValue});
            showToast(
                nextValue
                    ? 'Winky will launch automatically after you sign in to your system.'
                    : 'Auto-start disabled.',
                'success'
            );
        } catch (error) {
            console.error('[SettingsPage] Failed to update launch on startup', error);
            setLaunchOnSystemStartup(previousValue);
            showToast('Failed to update auto-start preference.', 'error');
        }
    };

    const handleLocalSpeechAutoStartChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.checked;
        const previousValue = autoStartLocalSpeech;
        setAutoStartLocalSpeech(nextValue);
        try {
            await updateConfig({autoStartLocalSpeechServer: nextValue});
            showToast(
                nextValue
                    ? 'Local speech server will try to start automatically when you use Local speech mode.'
                    : 'Local speech auto-start disabled.',
                'success'
            );
        } catch (error) {
            console.error('[SettingsPage] Failed to update local speech auto start', error);
            setAutoStartLocalSpeech(previousValue);
            showToast('Failed to update the local speech auto-start setting.', 'error');
        }
    };

    const handleAvatarVideoToggle = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.checked;
        const previousValue = showAvatarVideo;
        setShowAvatarVideo(nextValue);
        try {
            await updateConfig({showAvatarVideo: nextValue});
            showToast(nextValue ? 'Avatar video enabled.' : 'Avatar video hidden.', 'success');
        } catch (error) {
            console.error('[SettingsPage] Failed to toggle avatar video', error);
            setShowAvatarVideo(previousValue);
            showToast('Failed to update avatar video setting.', 'error');
        }
    };

    const handleSaveAudioHistoryToggle = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.checked;
        const previousValue = saveAudioHistory;
        setSaveAudioHistory(nextValue);
        try {
            await updateConfig({saveAudioHistory: nextValue});
            showToast(
                nextValue ? 'Audio will be saved to history.' : 'Audio history storage disabled.',
                'success'
            );
        } catch (error) {
            console.error('[SettingsPage] Failed to toggle audio history storage', error);
            setSaveAudioHistory(previousValue);
            showToast('Failed to update audio history setting.', 'error');
        }
    };

    const handleTrimSilenceToggle = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.checked;
        const previousValue = trimSilenceOnActions;
        setTrimSilenceOnActions(nextValue);
        try {
            await updateConfig({trimSilenceOnActions: nextValue});
            showToast(
                nextValue ? 'Silence trimming enabled.' : 'Silence trimming disabled.',
                'success'
            );
        } catch (error) {
            console.error('[SettingsPage] Failed to toggle silence trimming', error);
            setTrimSilenceOnActions(previousValue);
            showToast('Failed to update silence trimming setting.', 'error');
        }
    };

    const handleMicrophoneChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.value;
        try {
            await updateConfig({selectedMicrophoneId: nextValue});
            const deviceName = audioDevices.find(d => d.deviceId === nextValue)?.label || 'Default';
            showToast(`Microphone changed to: ${deviceName}`, 'success');
        } catch (error) {
            console.error('[SettingsPage] Failed to update microphone', error);
            showToast('Failed to update microphone setting.', 'error');
        }
    };

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
                autoSave
                onAutoSave={persistModelConfig}
                saving={saving}
                requireApiKeys={false}
            />

            <Box
                className={'fc gap-1'}
                component="section"
                sx={{
                    borderRadius: 4,
                    border: '1px solid rgba(244,63,94,0.15)',
                    backgroundColor: '#fff',
                    p: {xs: 3, md: 4},
                    boxShadow: '0 30px 60px rgba(255, 255, 255, 0.03)'
                }}
            >
                <div className={'fc'}>
                    <Typography variant="h6" color="text.primary" fontWeight={600}>
                        Application
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Control how Winky behaves together with your operating system.
                    </Typography>
                </div>

                <div className={'fc gap-2'}>
                    <FormControlLabel
                        control={<Checkbox checked={launchOnSystemStartup} onChange={handleLaunchOnStartupChange}/>}
                        label="Start Winky when your computer boots"
                    />
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        Enable this to add Winky to system auto-start so it runs as soon as you log in.
                    </Typography>
                </div>

                <div className={'fc gap-2'}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={autoStartLocalSpeech}
                                onChange={handleLocalSpeechAutoStartChange}
                            />
                        }
                        label="Auto-start local Whisper server"
                    />
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        Winky will install (if needed) and launch the bundled fast-fast-whisper server whenever Local
                        speech mode is active and setup is complete.
                    </Typography>
                </div>

                <div className={'fc gap-2'}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={showAvatarVideo}
                                onChange={handleAvatarVideoToggle}
                            />
                        }
                        label="Show sidebar avatar video"
                    />
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        Toggle the animated avatar in the sidebar on or off.
                    </Typography>
                </div>
            </Box>

            <Box
                className={'fc gap-1'}
                component="section"
                sx={{
                    borderRadius: 4,
                    border: '1px solid rgba(244,63,94,0.15)',
                    backgroundColor: '#fff',
                    p: {xs: 3, md: 4},
                    boxShadow: '0 30px 60px rgba(255, 255, 255, 0.03)'
                }}
            >
                <div className={'fc'}>
                    <Typography variant="h6" color="text.primary" fontWeight={600}>
                        Mic Overlay
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Configure the floating microphone overlay behaviour.
                    </Typography>
                </div>

                <div className={'fc gap-2'}>
                    <Typography variant="body2" fontWeight={600} color="text.primary">
                        Toggle Hotkey
                    </Typography>
                    <HotkeyInput
                        value={micHotkey}
                        onChange={handleHotkeyChange}
                        onInvalid={handleHotkeyInvalid}
                        placeholder="Press keys to set shortcut"
                    />
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        Press the desired key combination. Press Escape or use Clear to remove the shortcut.
                    </Typography>
                </div>

                <div className={'fc gap-1'}>
                    <div className={'fc gap-2'}>
                        <FormControlLabel
                            control={<Checkbox checked={micAutoStart} onChange={handleAutoStartChange}/>}
                            label="Start recording automatically"
                        />
                        <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                            When enabled, showing the mic via hotkey or taskbar menu immediately begins recording.
                        </Typography>
                    </div>

                    <div className={'fc gap-2'}>
                        <FormControlLabel
                            control={<Checkbox checked={micHideOnStop} onChange={handleHideOnStopChange}/>}
                            label="Hide mic overlay when recording stops"
                        />
                        <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                            When enabled, the mic automatically hides after you stop recording. When disabled,
                            it stays visible.
                        </Typography>
                    </div>

                    <div className={'fc gap-2'}>
                        <FormControlLabel
                            control={<Checkbox checked={micShowOnLaunch} onChange={handleShowOnLaunchChange}/>}
                            label="Show mic overlay when Winky starts"
                        />
                        <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                            Controls whether the floating microphone opens automatically right after the app launches.
                        </Typography>
                    </div>

                    <div className={'fc gap-2'}>
                        <FormControlLabel
                            control={<Checkbox checked={completionSoundEnabled}
                                               onChange={handleCompletionSoundToggle}/>}
                            label="Play sound when an action completes"
                        />
                        <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                            Uncheck to disable the completion sound entirely, regardless of volume.
                        </Typography>
                    </div>
                </div>

                <div className={'fc '}>
                    <Typography variant="body2" fontWeight={600} color="text.primary">
                        Completion Sound Volume: {Math.round(completionSoundVolume * 100)}%
                    </Typography>
                    <Slider
                        value={completionSoundVolume}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={handleVolumeChange}
                        onChangeCommitted={handleVolumeSave}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(value) => `${Math.round((value as number) * 100)}%`}
                    />
                    <Typography variant="caption" color="text.secondary">
                        Adjust the volume of the sound that plays when an action completes. Set to 0% to disable.
                    </Typography>
                </div>
            </Box>

            <Box
                className={'fc gap-1'}
                component="section"
                sx={{
                    borderRadius: 4,
                    border: '1px solid rgba(244,63,94,0.15)',
                    backgroundColor: '#fff',
                    p: {xs: 3, md: 4},
                    boxShadow: '0 30px 60px rgba(255, 255, 255, 0.03)'
                }}
            >
                <div className={'fc'}>
                    <Typography variant="h6" color="text.primary" fontWeight={600}>
                        Audio Processing
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Decide how action audio is stored and prepared before transcription.
                    </Typography>
                </div>

                <div className={'fc gap-2'}>
                    <FormControlLabel
                        control={<Checkbox checked={saveAudioHistory} onChange={handleSaveAudioHistoryToggle}/>}
                        label="Save audio in history"
                    />
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        Stores the recorded audio file locally for each action so you can replay it in History.
                    </Typography>
                </div>

                <div className={'fc gap-2'}>
                    <FormControlLabel
                        control={<Checkbox checked={trimSilenceOnActions} onChange={handleTrimSilenceToggle}/>}
                        label="Trim silence before transcription"
                    />
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        Removes long pauses before sending audio for transcription. Disabled by default.
                    </Typography>
                </div>

                <div className={'fc gap-2'}>
                    <Typography variant="body2" fontWeight={600} color="text.primary">
                        Microphone Device
                    </Typography>
                    <TextField
                        select
                        value={config?.selectedMicrophoneId || 'default'}
                        onChange={handleMicrophoneChange}
                        fullWidth
                    >
                        <MenuItem value="default">Default</MenuItem>
                        {audioDevices.map(device => (
                            <MenuItem key={device.deviceId} value={device.deviceId}>
                                {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Typography variant="caption" color="text.secondary">
                        Select which microphone to use for recording. Changes take effect immediately.
                    </Typography>
                </div>
            </Box>
        </div>
    );
};

export default SettingsPage;
