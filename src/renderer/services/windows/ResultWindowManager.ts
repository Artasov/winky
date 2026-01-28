import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {listen, emit} from '@tauri-apps/api/event';
import {AuxWindowController} from './AuxWindowController';

export type ResultPayload = {
    transcription?: string;
    llmResponse?: string;
    isStreaming?: boolean;
};

/**
 * РњРµРЅРµРґР¶РµСЂ РґР»СЏ СѓРїСЂР°РІР»РµРЅРёСЏ РѕРєРЅРѕРј СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ
 * РћР±РµСЃРїРµС‡РёРІР°РµС‚ РЅР°РґРµР¶РЅСѓСЋ РїРµСЂРµРґР°С‡Сѓ РґР°РЅРЅС‹С… РјРµР¶РґСѓ РѕРєРЅР°РјРё
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

        // РЎР»СѓС€Р°РµРј СЃРѕР±С‹С‚РёРµ РіРѕС‚РѕРІРЅРѕСЃС‚Рё РѕРєРЅР°
        void listen('result:ready', () => {
            this.isReady = true;
            this.readyWaiters.forEach((waiter) => waiter());
            this.readyWaiters.clear();
        });
    }

    /**
     * РћР¶РёРґР°РµС‚ РіРѕС‚РѕРІРЅРѕСЃС‚Рё РѕРєРЅР° СЃ С‚Р°Р№РјР°СѓС‚РѕРј
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
     * РћС‚РїСЂР°РІР»СЏРµС‚ РґР°РЅРЅС‹Рµ РІ РѕРєРЅРѕ
     */
    private async sendPayload(payload: ResultPayload): Promise<void> {
        this.lastPayload = this.lastPayload ? {...this.lastPayload, ...payload} : payload;
        this.eventHistory.push(payload);
        await emit('result:data', payload);
    }

    /**
     * РћС‚РєСЂС‹РІР°РµС‚ РѕРєРЅРѕ Рё Р¶РґРµС‚ РµРіРѕ РіРѕС‚РѕРІРЅРѕСЃС‚Рё
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
            
            // РћС‡РёС‰Р°РµРј СЃРѕСЃС‚РѕСЏРЅРёРµ РґР»СЏ РЅРѕРІРѕРіРѕ СЃРµР°РЅСЃР°
            this.lastPayload = null;
            this.eventHistory = [];
            
            // РћС‚РїСЂР°РІР»СЏРµРј РѕС‚Р»РѕР¶РµРЅРЅС‹Рµ РґР°РЅРЅС‹Рµ
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
     * Р—Р°РєСЂС‹РІР°РµС‚ РѕРєРЅРѕ
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
     * РћР±РЅРѕРІР»СЏРµС‚ РґР°РЅРЅС‹Рµ РІ РѕРєРЅРµ
     */
    async update(payload: ResultPayload): Promise<void> {
        
        // РћР±РЅРѕРІР»СЏРµРј СЃРѕСЃС‚РѕСЏРЅРёРµ
        this.lastPayload = this.lastPayload ? {...this.lastPayload, ...payload} : payload;
        this.eventHistory.push(payload);
        
        // Р•СЃР»Рё РѕРєРЅРѕ РЅРµ РіРѕС‚РѕРІРѕ, СЃРѕС…СЂР°РЅСЏРµРј РґР°РЅРЅС‹Рµ
        if (!this.isReady) {
            this.pendingPayload = this.pendingPayload ? {...this.pendingPayload, ...payload} : payload;
            
            // РќРµР±РѕР»СЊС€Р°СЏ Р·Р°РґРµСЂР¶РєР° РґР»СЏ РїСЂРѕРІРµСЂРєРё РіРѕС‚РѕРІРЅРѕСЃС‚Рё
            await new Promise(resolve => setTimeout(resolve, 50));
            if (this.isReady && this.pendingPayload) {
                const finalPayload = this.pendingPayload;
                this.pendingPayload = null;
                await this.sendPayload(finalPayload);
            }
            return;
        }
        
        // РћС‚РїСЂР°РІР»СЏРµРј РґР°РЅРЅС‹Рµ РµСЃР»Рё РѕРєРЅРѕ РіРѕС‚РѕРІРѕ
        await this.sendPayload(payload);
    }
    /**
     * РџРѕРґРїРёСЃС‹РІР°РµС‚СЃСЏ РЅР° РѕР±РЅРѕРІР»РµРЅРёСЏ РґР°РЅРЅС‹С…
     */
    onData(callback: (payload: ResultPayload) => void): () => void {
        const unlistenPromise = listen<ResultPayload>('result:data', (event) => {
            callback(event.payload);
        });
        
        // РћС‚РїСЂР°РІР»СЏРµРј С‚РµРєСѓС‰РµРµ СЃРѕСЃС‚РѕСЏРЅРёРµ
        if (this.lastPayload) {
            setTimeout(() => {
                callback(this.lastPayload!);
            }, 0);
        }
        
        // РћС‚РїСЂР°РІР»СЏРµРј РёСЃС‚РѕСЂРёСЋ СЃРѕР±С‹С‚РёР№
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


