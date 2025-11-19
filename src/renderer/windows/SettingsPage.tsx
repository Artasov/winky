import React, {ChangeEvent, useEffect, useRef, useState} from 'react';
import {Box, Button, Checkbox, FormControlLabel, Slider, Typography} from '@mui/material';
import {useConfig} from '../context/ConfigContext';
import {useUser} from '../context/UserContext';
import {useToast} from '../context/ToastContext';
import {LLM_API_MODELS, LLM_MODES, SPEECH_API_MODELS, SPEECH_MODES} from '@shared/constants';
import type {MicAnchor} from '@shared/types';
import ModelConfigForm, {ModelConfigFormData} from '../components/ModelConfigForm';
import HotkeyInput from '../components/HotkeyInput';
import theme from "@renderer/theme/muiTheme";

const SettingsPage: React.FC = () => {
    const {config, updateConfig} = useConfig();
    const {user} = useUser();
    const {showToast} = useToast();

    const [formData, setFormData] = useState<ModelConfigFormData>({
        openaiKey: '',
        googleKey: '',
        transcribeMode: SPEECH_MODES.API,
        transcribeModel: SPEECH_API_MODELS[0],
        llmMode: LLM_MODES.API,
        llmModel: LLM_API_MODELS[0]
    });

    const [saving, setSaving] = useState(false);
    const [micHotkey, setMicHotkey] = useState('');
    const [micAnchor, setMicAnchor] = useState<MicAnchor>('bottom-right');
    const [micAutoStart, setMicAutoStart] = useState(false);
    const [micHideOnStop, setMicHideOnStop] = useState(true);
    const [micShowOnLaunch, setMicShowOnLaunch] = useState(true);
    const [launchOnSystemStartup, setLaunchOnSystemStartup] = useState(false);
    const [autoStartLocalSpeech, setAutoStartLocalSpeech] = useState(false);
    const [completionSoundEnabled, setCompletionSoundEnabled] = useState(true);
    const [completionSoundVolume, setCompletionSoundVolume] = useState(1.0);

    useEffect(() => {
        if (config) {
            setFormData({
                openaiKey: config.apiKeys.openai ?? '',
                googleKey: config.apiKeys.google ?? '',
                transcribeMode: config.speech.mode,
                transcribeModel: config.speech.model,
                llmMode: config.llm.mode,
                llmModel: config.llm.model
            });
            setMicHotkey(config.micHotkey ?? '');
            setMicAnchor((config.micAnchor as MicAnchor) ?? 'bottom-right');
            setMicAutoStart(Boolean(config.micAutoStartRecording));
            setMicHideOnStop(config.micHideOnStopRecording ?? true);
            setMicShowOnLaunch(config.micShowOnLaunch !== false);
            setCompletionSoundEnabled(config.completionSoundEnabled !== false);
            setCompletionSoundVolume(config.completionSoundVolume ?? 1.0);
            setLaunchOnSystemStartup(Boolean(config.launchOnSystemStartup));
            setAutoStartLocalSpeech(Boolean(config.autoStartLocalSpeechServer));
        }
    }, [config]);

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
                }
            });
        } catch (error) {
            console.error('[SettingsPage] Failed to save model config', error);
            showToast('Failed to update model config.', 'error');
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
            showToast('Не удалось обновить настройку автозапуска локального сервера.', 'error');
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
                component="section"
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
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
                                disabled={config?.speech.mode !== SPEECH_MODES.LOCAL}
                            />
                        }
                        label="Auto-start local Whisper server"
                    />
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        Winky will install (if needed) and launch the bundled fast-fast-whisper server whenever Local
                        speech mode is active and setup is complete.
                    </Typography>
                </div>
            </Box>

            <Box
                component="section"
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
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

                <div className={'fc gap-2'}>
                    <Typography variant="body2" fontWeight={600} color="text.primary">
                        Default Position
                    </Typography>
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: {xs: 'repeat(2, 1fr)', sm: 'repeat(4, minmax(0, 1fr))'},
                            gap: 1
                        }}
                    >
                        {anchorOptions.map((option) => {
                            const isSelected = micAnchor === option.value;
                            return (
                                <Button
                                    key={option.value}
                                    variant={isSelected ? 'contained' : 'outlined'}
                                    color="primary"
                                    size="small"
                                    onClick={() => handleAnchorSelect(option.value)}
                                    sx={{
                                        backgroundColor: theme.palette.primary.main + '11',
                                        borderRadius: 2,
                                        textTransform: 'none',
                                        fontWeight: 600
                                    }}
                                >
                                    {option.label}
                                </Button>
                            );
                        })}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                        Select one of the corners to dock the microphone overlay. The overlay moves immediately.
                    </Typography>
                </div>

                <div className={'fc gap-2 -mt-[12px]'}>
                    <FormControlLabel
                        control={<Checkbox checked={micAutoStart} onChange={handleAutoStartChange}/>}
                        label="Start recording automatically"
                    />
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        When enabled, showing the mic via hotkey or taskbar menu immediately begins recording.
                    </Typography>
                </div>

                <div className={'fc gap-2 -mt-[12px]'}>
                    <FormControlLabel
                        control={<Checkbox checked={micHideOnStop} onChange={handleHideOnStopChange}/>}
                        label="Hide mic overlay when recording stops"
                    />
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        When enabled, the mic overlay automatically hides after you stop recording. When disabled, it
                        stays visible.
                    </Typography>
                </div>

                <div className={'fc gap-2 -mt-[12px]'}>
                    <FormControlLabel
                        control={<Checkbox checked={micShowOnLaunch} onChange={handleShowOnLaunchChange}/>}
                        label="Show mic overlay when Winky starts"
                    />
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        Controls whether the floating microphone opens automatically right after the app launches.
                    </Typography>
                </div>

                <div className={'fc gap-2 -mt-[12px]'}>
                    <FormControlLabel
                        control={<Checkbox checked={completionSoundEnabled} onChange={handleCompletionSoundToggle}/>}
                        label="Play sound when an action completes"
                    />
                    <Typography sx={{mt: -1}} variant="caption" color="text.secondary">
                        Uncheck to disable the completion sound entirely, regardless of volume.
                    </Typography>
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
        </div>
    );
};

export default SettingsPage;
