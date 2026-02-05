import {invoke} from '@tauri-apps/api/core';

export const actionHotkeysBridge = {
    register: (hotkeys: Array<{id: string; accelerator: string}>) =>
        invoke('action_hotkeys_register', {hotkeys}),
    clear: () => invoke('action_hotkeys_clear'),
    setRecordingActive: (active: boolean) => invoke('hotkeys_set_recording_active', {active})
};
