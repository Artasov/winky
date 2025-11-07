import {app, BrowserWindow, ipcMain, shell} from 'electron';
import type {AuthDeepLinkPayload, AuthProvider} from '@shared/types';
import {IPC_CHANNELS} from '@shared/constants';
import {buildOAuthStartUrl} from '../services/oauth.service';

type PendingAuthPayload = {
    payload: AuthDeepLinkPayload;
    delivered: boolean;
};

const pendingAuthPayloads: PendingAuthPayload[] = [];
const processedDeepLinks = new Set<string>();
let authIpcRegistered = false;

export const notifyAuthPayloads = (target: BrowserWindow | null): void => {
    if (!target || target.isDestroyed()) {
        return;
    }
    const contents = target.webContents;
    if (!contents || contents.isDestroyed()) {
        return;
    }
    for (const entry of pendingAuthPayloads) {
        if (entry.delivered) {
            continue;
        }
        try {
            contents.send(IPC_CHANNELS.AUTH_DEEP_LINK, entry.payload);
            entry.delivered = true;
        } catch (error) {
            console.warn('[auth] Failed to dispatch OAuth payload', error);
            break;
        }
    }
};

export const handleAuthUrl = (url: string): void => {
    if (typeof url !== 'string' || !url.trim().startsWith('winky://')) {
        return;
    }
    if (processedDeepLinks.has(url)) {
        return;
    }
    processedDeepLinks.add(url);
    const payload = parseAuthPayload(url);
    if (payload) {
        enqueueAuthPayload(payload);
    }
};

export const extractDeepLinksFromArgv = (argv: string[]): string[] => {
    return argv.filter((arg) => typeof arg === 'string' && arg.startsWith('winky://'));
};

export const registerAuthProtocol = (): void => {
    try {
        const protocol = 'winky';
        if (process.defaultApp && process.argv.length >= 2) {
            const exePath = process.execPath;
            const appPath = process.argv[1];
            app.setAsDefaultProtocolClient(protocol, exePath, [appPath]);
        } else {
            app.setAsDefaultProtocolClient(protocol);
        }
    } catch (error) {
        console.warn('[auth] Failed to register protocol handler', error);
    }
};

export const registerAuthIpc = (): void => {
    if (authIpcRegistered) {
        return;
    }
    authIpcRegistered = true;

    ipcMain.handle(IPC_CHANNELS.AUTH_START_OAUTH, async (_event, provider: AuthProvider) => {
        const normalized = String(provider).toLowerCase() as AuthProvider;
        const supportedProviders: AuthProvider[] = ['google', 'github', 'discord'];
        if (!supportedProviders.includes(normalized)) {
            throw new Error(`Unsupported OAuth provider: ${provider}`);
        }
        const url = buildOAuthStartUrl(normalized);
        await shell.openExternal(url);
    });

    ipcMain.handle(IPC_CHANNELS.AUTH_CONSUME_DEEP_LINKS, async () => {
        if (!pendingAuthPayloads.length) {
            return [];
        }
        const payloads = pendingAuthPayloads.splice(0, pendingAuthPayloads.length).map((entry) => entry.payload);
        return payloads;
    });
};

function enqueueAuthPayload(payload: AuthDeepLinkPayload) {
    pendingAuthPayloads.push({payload, delivered: false});
}

function parseAuthPayload(url: string): AuthDeepLinkPayload | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'winky:') return null;
        if (parsed.hostname !== 'auth') return null;
        if (!parsed.pathname.startsWith('/callback')) return null;
        const rawPayload = parsed.searchParams.get('payload');
        if (!rawPayload) return null;
        const decoded = decodeURIComponent(rawPayload);
        const data = JSON.parse(decoded) as Record<string, unknown>;
        if (data?.app !== 'winky') {
            return {
                kind: 'error',
                provider: String(data?.provider ?? 'unknown'),
                error: 'Invalid application payload'
            };
        }
        const provider = String(data?.provider ?? 'unknown');
        if (typeof data?.error === 'string' && data.error.trim().length) {
            return {
                kind: 'error',
                provider,
                error: data.error
            };
        }
        const tokens = data?.tokens as Record<string, unknown> | undefined;
        if (!tokens || typeof tokens.access !== 'string' || !tokens.access.trim().length) {
            return {
                kind: 'error',
                provider,
                error: 'Missing access token in OAuth payload'
            };
        }
        const refresh = typeof tokens.refresh === 'string' && tokens.refresh.trim().length
            ? tokens.refresh
            : null;
        const user = (data?.user && typeof data.user === 'object') ? data.user as Record<string, unknown> : null;
        return {
            kind: 'success',
            provider,
            tokens: {
                access: tokens.access,
                refresh
            },
            user
        };
    } catch (error) {
        console.error('[auth] Failed to parse OAuth payload', error);
        return {
            kind: 'error',
            provider: 'unknown',
            error: 'Malformed OAuth payload'
        };
    }
}
