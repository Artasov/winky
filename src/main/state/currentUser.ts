import type {User} from '@shared/types';

let currentUser: User | null = null;

export const getCurrentUserCache = (): User | null => currentUser;

export const setCurrentUserCache = (user: User | null): void => {
    currentUser = user;
};
