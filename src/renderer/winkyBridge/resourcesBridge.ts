import {invoke} from '@tauri-apps/api/core';

export const resourcesBridge = {
    getSoundPath: (soundName: string): Promise<string> => invoke('resources_sound_path', {soundName}),
    getSoundData: (soundName: string): Promise<Uint8Array> => invoke('resources_sound_data', {soundName})
};

export type ResourcesBridge = typeof resourcesBridge;
