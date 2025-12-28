import {invoke} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import type {MicAnchor} from '@shared/types';
import {MIC_WINDOW_HEIGHT, MIC_WINDOW_MARGIN, MIC_WINDOW_WIDTH} from '@shared/constants';
import {MicWindowController} from './services/windows/MicWindowController';
import {configBridge as configApi} from './winkyBridge/configBridge';
import {clipboardBridge as clipboardApi} from './winkyBridge/clipboardBridge';
import {authBridge as authApi} from './winkyBridge/authBridge';
import {actionsBridge as actionsApi, iconsBridge as iconsApi} from './winkyBridge/actionsBridge';
import {profileBridge as profileApi} from './winkyBridge/profileBridge';
import {speechBridge as speechApi} from './winkyBridge/speechBridge';
import {llmBridge as llmApi} from './winkyBridge/llmBridge';
import {resourcesBridge as resourcesApi} from './winkyBridge/resourcesBridge';
import {notificationsBridge} from './winkyBridge/notificationsBridge';
import {
    auxWindowsBridge,
    resultBridge,
    windowControlsBridge as baseWindowControlsBridge,
    windowsBridge
} from './winkyBridge/windowsBridge';
import {eventsBridge} from './winkyBridge/eventsBridge';
import {actionHotkeysBridge as actionHotkeysApi} from './winkyBridge/actionHotkeysBridge';
import {localSpeechBridge as localSpeechApi} from './winkyBridge/localSpeechBridge';
import {ollamaBridge as ollamaApi} from './winkyBridge/ollamaBridge';
import {attachMicBridgeEvents} from './winkyBridge/micBridgeEvents';

const resolveWindowKind = (): 'main' | 'mic' | 'result' | 'error' => {
    if (typeof window === 'undefined') {
        return 'main';
    }
    const params = new URLSearchParams(window.location.search);
    const label = params.get('window');
    if (!label) {
        return 'main';
    }
    if (label === 'mic' || label === 'result' || label === 'error') {
        return label;
    }
    return 'main';
};

const currentWindowKind = resolveWindowKind();
const currentWindow = getCurrentWindow();

const windowControlsBridge = {
    ...baseWindowControlsBridge,
    openDevtools: async () => {
        const maybeWindow = currentWindow as unknown as { openDevtools?: () => Promise<void> };
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

if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (event) => {
        const isAccel = event.ctrlKey || event.metaKey;
        if ((isAccel && event.shiftKey && event.code === 'KeyI') || event.code === 'F12') {
            event.preventDefault();
            void windowControlsBridge.openDevtools();
        }
    });
}

const micController = new MicWindowController({
    configApi,
    micWindowWidth: MIC_WINDOW_WIDTH,
    micWindowHeight: MIC_WINDOW_HEIGHT,
    micWindowMargin: MIC_WINDOW_MARGIN
});

// Предзагружаем микроокно в главном окне, чтобы первое открытие было мгновенным и без белого фона.
if (currentWindowKind === 'main') {
    void micController.warmup();
}
const openMainWindow = async (): Promise<void> => {
    try {
        await invoke('window_open_main');
        return;
    } catch {
        /* ignore */
    }
    try {
        await currentWindow.show();
        await currentWindow.setFocus();
    } catch {
        /* ignore */
    }
};

window.winky = {
    config: configApi,
    resources: resourcesApi,
    clipboard: clipboardApi,
    auth: authApi,
    actions: actionsApi,
    icons: iconsApi,
    profile: profileApi,
    speech: speechApi,
    llm: llmApi,
    result: resultBridge,
    windows: windowsBridge,
    notifications: notificationsBridge,
    windowControls: windowControlsBridge,
    mic: {
        moveWindow: (x: number, y: number) => micController.moveWindow(x, y),
        moveBy: (dx: number, dy: number) => micController.moveBy(dx, dy),
        setInteractive: (interactive: boolean) => micController.setInteractive(interactive),
        getPosition: () => micController.getPosition(),
        getCursorPosition: () => micController.getCursorPosition(),
        setAnchor: (anchor: MicAnchor) => micController.setAnchor(anchor),
        show: (reason?: string) => micController.show(reason),
        hide: (options?: {reason?: string; disableAutoShow?: boolean}) => micController.hide(options?.reason || 'system'),
        toggle: (reason?: string) => micController.toggle(reason),
        beginDrag: () => micController.beginDrag()
    },
    actionHotkeys: actionHotkeysApi,
    localSpeech: localSpeechApi,
    ollama: ollamaApi,
    auxWindows: auxWindowsBridge,
    on: eventsBridge.on,
    removeListener: eventsBridge.removeListener
} as any;

attachMicBridgeEvents({micController, currentWindowKind, openMainWindow});
