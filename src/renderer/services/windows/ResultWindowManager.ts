import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {listen, emit} from '@tauri-apps/api/event';
import {AuxWindowController} from './AuxWindowController';

export type ResultPayload = {
    transcription?: string;
    llmResponse?: string;
    isStreaming?: boolean;
};

/**
 * Manages the result window lifecycle and event delivery.
 * Keeps payload transfer reliable across repeated opens and updates.
 */
export class ResultWindowManager {
    private readonly window: AuxWindowController;
    private lastPayload: ResultPayload | null = null;
    private eventHistory: ResultPayload[] = [];
    private readyWaiters = new Set<() => void>();
    private isReady = false;
    private pendingPayload: ResultPayload | null = null;

    constructor() {
        this.window = new AuxWindowController('result', 'result', {
            width: 700,
            height: 600,
            resizable: true,
            decorations: false,
            shadow: false,
            transparent: true
        });

        // Listen for the result window ready signal.
        void listen('result:ready', () => {
            this.isReady = true;
            this.readyWaiters.forEach((waiter) => waiter());
            this.readyWaiters.clear();
        });
    }

    /**
     * Waits until the result window reports that it is ready.
     */
    private waitForReady(timeout: number = 5000): Promise<void> {
        if (this.isReady) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout> | null = null;
            const waiter = () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                this.readyWaiters.delete(waiter);
                resolve();
            };
            timer = setTimeout(() => {
                this.readyWaiters.delete(waiter);
                console.warn('[ResultWindowManager] Timeout waiting for window ready');
                reject(new Error('Result window ready timeout'));
            }, timeout);
            this.readyWaiters.add(waiter);
        });
    }

    /**
     * Sends payload data to the result window.
     */
    private async sendPayload(payload: ResultPayload): Promise<void> {
        this.lastPayload = this.lastPayload ? {...this.lastPayload, ...payload} : payload;
        this.eventHistory.push(payload);
        await emit('result:data', payload);
    }

    /**
     * Opens the result window and waits for readiness.
     */
    async open(): Promise<void> {
        
        const existingWindow = await WebviewWindow.getByLabel('result').catch(() => null);
        const isAlreadyOpen = existingWindow !== null;
        
        this.isReady = false;
        this.pendingPayload = null;
        
        await this.window.show();
        
        if (isAlreadyOpen) {
            await emit('result:request-ready', {});
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        try {
            await this.waitForReady();
            
            // Reset state for a fresh result session.
            this.lastPayload = null;
            this.eventHistory = [];
            
            // Flush any payload collected before readiness.
            if (this.pendingPayload) {
                const payload = this.pendingPayload;
                this.pendingPayload = null;
                await this.sendPayload(payload);
            }
        } catch (error) {
            console.error('[ResultWindowManager] Failed to wait for ready:', error);
            if (isAlreadyOpen) {
                this.isReady = true;
                this.lastPayload = null;
                this.eventHistory = [];
                if (this.pendingPayload) {
                    const payload = this.pendingPayload;
                    this.pendingPayload = null;
                    await this.sendPayload(payload);
                }
            } else {
                this.lastPayload = null;
                this.eventHistory = [];
            }
        }
    }

    /**
     * Closes the result window and clears cached state.
     */
    async close(): Promise<void> {
        this.lastPayload = null;
        this.eventHistory = [];
        this.pendingPayload = null;
        this.isReady = false;
        this.readyWaiters.forEach((waiter) => waiter());
        this.readyWaiters.clear();
        await this.window.close();
    }

    /**
     * Updates the current result payload.
     */
    async update(payload: ResultPayload): Promise<void> {
        
        // Merge the latest update into cached state.
        this.lastPayload = this.lastPayload ? {...this.lastPayload, ...payload} : payload;
        this.eventHistory.push(payload);
        
        // Cache updates until the window is ready.
        if (!this.isReady) {
            this.pendingPayload = this.pendingPayload ? {...this.pendingPayload, ...payload} : payload;
            
            // Give the ready event a moment to arrive before retrying.
            await new Promise(resolve => setTimeout(resolve, 50));
            if (this.isReady && this.pendingPayload) {
                const finalPayload = this.pendingPayload;
                this.pendingPayload = null;
                await this.sendPayload(finalPayload);
            }
            return;
        }
        
        // Send immediately once the window is ready.
        await this.sendPayload(payload);
    }
    /**
     * Subscribes to result payload updates.
     */
    onData(callback: (payload: ResultPayload) => void): () => void {
        const unlistenPromise = listen<ResultPayload>('result:data', (event) => {
            callback(event.payload);
        });
        
        // Replay the current state to new subscribers.
        if (this.lastPayload) {
            setTimeout(() => {
                callback(this.lastPayload!);
            }, 0);
        }
        
        // Replay merged event history to rebuild the latest snapshot.
        if (this.eventHistory.length > 0) {
            const mergedPayload = this.eventHistory.reduce((acc, entry) => ({...acc, ...entry}), {} as ResultPayload);
            setTimeout(() => {
                callback(mergedPayload);
            }, 0);
        }
        
        return () => {
            unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
        };
    }
}


