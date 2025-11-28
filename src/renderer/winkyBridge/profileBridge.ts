import {fetchProfile, fetchCurrentUser} from '../services/winkyApi';
import type {WinkyProfile} from '@shared/types';

export const profileBridge = {
    fetch: (): Promise<WinkyProfile> => fetchProfile(),
    currentUser: (options?: {includeTiersAndFeatures?: boolean}) => fetchCurrentUser(options)
};

export type ProfileBridge = typeof profileBridge;
