import {listen, type UnlistenFn} from '@tauri-apps/api/event';

const eventListeners = new Map<string, UnlistenFn>();

export const eventsBridge = {
    on: (channel: string, callback: (...args: any[]) => void) => {
        const key = `${channel}:${callback.toString()}`;
        const unlistenPromise = listen(channel, (event) => callback(event.payload));
        unlistenPromise.then((unlisten) => {
            eventListeners.set(key, unlisten);
        });
        return () => {
            unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
            eventListeners.delete(key);
        };
    },
    removeListener: (channel: string, callback: (...args: any[]) => void) => {
        const key = `${channel}:${callback.toString()}`;
        const handler = eventListeners.get(key);
        if (handler) {
            handler();
            eventListeners.delete(key);
        }
    }
};

export type EventsBridge = typeof eventsBridge;
