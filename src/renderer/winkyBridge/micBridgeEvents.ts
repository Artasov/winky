import {emit, listen} from '@tauri-apps/api/event';
import {MicWindowController} from '../services/windows/MicWindowController';

export type MicBridgeEventsDeps = {
    micController: MicWindowController;
    currentWindowKind: 'main' | 'mic' | 'result' | 'error';
    openMainWindow: () => Promise<void>;
};

export const attachMicBridgeEvents = ({micController, currentWindowKind, openMainWindow}: MicBridgeEventsDeps): void => {
    void listen('mic:show-request', (event) => {
        const reason = (event.payload as any)?.reason ?? 'system';
        void micController.show(reason);
    });

    void listen('mic:hide-request', (event) => {
        const reason = (event.payload as any)?.reason ?? 'system';
        void micController.hide(reason);
    });

    void listen('mic:toggle-request', (event) => {
        const reason = (event.payload as any)?.reason ?? 'system';
        void micController.toggle(reason);
    });

    void listen('mic:ready', () => {
        void micController.handleMicReady();
    });

    let micShortcutHandling = false;
    let lastShortcutAt = 0;
    const SHORTCUT_COOLDOWN_MS = 120;
    void listen('mic:shortcut', () => {
        const now = Date.now();
        if (micShortcutHandling || now - lastShortcutAt < SHORTCUT_COOLDOWN_MS) {
            return;
        }
        micShortcutHandling = true;
        const finish = () => {
            lastShortcutAt = Date.now();
            micShortcutHandling = false;
        };
        const result = micController.toggle('shortcut');
        if (result && typeof (result as Promise<void>).finally === 'function') {
            void (result as Promise<void>).finally(finish);
        } else {
            finish();
        }
    });

    void listen('tray:open-main', async () => {
        if (currentWindowKind !== 'main') {
            return;
        }
        try {
            await openMainWindow();
            await emit('navigate-to', '/actions');
        } catch {
            /* ignore */
        }
    });
};
