import {invoke} from '@tauri-apps/api/core';

export const resourcesBridge = {
    getSoundData: (soundName: string): Promise<Uint8Array> => invoke('resources_sound_data', {soundName})
};
