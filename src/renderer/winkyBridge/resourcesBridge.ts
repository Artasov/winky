import {invoke} from '@tauri-apps/api/core';

export const resourcesBridge = {
    getSoundData: (soundName: string): Promise<Uint8Array> => invoke('resources_sound_data', {soundName}),
    playSound: (soundName: string): Promise<void> => invoke('resources_play_sound', {soundName})
};
