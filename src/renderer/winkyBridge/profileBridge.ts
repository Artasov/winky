import {fetchProfile} from '../services/winkyApi';
import type {WinkyProfile} from '@shared/types';

export const profileBridge = {
    fetch: (): Promise<WinkyProfile> => fetchProfile()
};
