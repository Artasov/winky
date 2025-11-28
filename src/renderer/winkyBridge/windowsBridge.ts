import {invoke} from '@tauri-apps/api/core';
import {emit} from '@tauri-apps/api/event';
import {ResultWindowManager, type ResultPayload} from '@renderer/services/windows';
import {AuxWindowController} from '@renderer/services/windows';
import {getCurrentWindow} from '@tauri-apps/api/window';

const resultWindowManager = new ResultWindowManager();
const currentWindow = getCurrentWindow();

const errorWindow = new AuxWindowController('error', 'error', {
    width: 520,
    height: 360,
    decorations: false
});

export const resultBridge = {
    open: () => resultWindowManager.open(),
    close: () => resultWindowManager.close(),
    update: (payload: ResultPayload) => resultWindowManager.update(payload),
    subscribe: (callback: (payload: ResultPayload) => void) => resultWindowManager.onData(callback)
};

export const windowsBridge = {
    openSettings: () => emit('navigate-to', '/settings'),
    navigate: (route: string) => emit('navigate-to', route)
};

export const windowControlsBridge = {
    minimize: () => currentWindow.minimize(),
    close: () => currentWindow.close(),
    openDevtools: async () => {
        const maybeWindow = currentWindow as unknown as {openDevtools?: () => Promise<void>};
        if (maybeWindow?.openDevtools) {
            try {
                await maybeWindow.openDevtools();
                return;
            } catch {
                /* ignore */
            }
        }
        try {
            await invoke('window_open_devtools');
        } catch {
            /* ignore */
        }
    }
};

export const auxWindowsBridge = {
    error: {
        open: (payload: unknown) => errorWindow.open(payload),
        close: () => errorWindow.close()
    }
};
