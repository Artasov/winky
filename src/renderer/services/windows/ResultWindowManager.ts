import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {listen, emit} from '@tauri-apps/api/event';
import {AuxWindowController} from './AuxWindowController';

export type ResultPayload = {
    transcription?: string;
    llmResponse?: string;
    isStreaming?: boolean;
};

/**
 * Менеджер для управления окном результатов
 * Обеспечивает надежную передачу данных между окнами
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

        // Слушаем событие готовности окна
        void listen('result:ready', () => {
            console.log('[ResultWindowManager] Window is ready');
            this.isReady = true;
            this.readyWaiters.forEach((waiter) => waiter());
            this.readyWaiters.clear();
        });
    }

    /**
     * Ожидает готовности окна с таймаутом
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
     * Отправляет данные в окно
     */
    private async sendPayload(payload: ResultPayload): Promise<void> {
        this.lastPayload = this.lastPayload ? {...this.lastPayload, ...payload} : payload;
        this.eventHistory.push(payload);
        await emit('result:data', payload);
    }

    /**
     * Открывает окно и ждет его готовности
     */
    async open(): Promise<void> {
        console.log('[ResultWindowManager] Opening window...');
        
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
            console.log('[ResultWindowManager] Window is ready');
            
            // Очищаем состояние для нового сеанса
            this.lastPayload = null;
            this.eventHistory = [];
            
            // Отправляем отложенные данные
            if (this.pendingPayload) {
                const payload = this.pendingPayload;
                this.pendingPayload = null;
                await this.sendPayload(payload);
            }
        } catch (error) {
            console.error('[ResultWindowManager] Failed to wait for ready:', error);
            if (isAlreadyOpen) {
                console.log('[ResultWindowManager] Window was already open, considering ready');
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
     * Закрывает окно
     */
    async close(): Promise<void> {
        console.log('[ResultWindowManager] Closing window...');
        this.lastPayload = null;
        this.eventHistory = [];
        this.pendingPayload = null;
        this.isReady = false;
        this.readyWaiters.forEach((waiter) => waiter());
        this.readyWaiters.clear();
        await this.window.close();
    }

    /**
     * Обновляет данные в окне
     */
    async update(payload: ResultPayload): Promise<void> {
        
        // Обновляем состояние
        this.lastPayload = this.lastPayload ? {...this.lastPayload, ...payload} : payload;
        this.eventHistory.push(payload);
        
        // Если окно не готово, сохраняем данные
        if (!this.isReady) {
            this.pendingPayload = this.pendingPayload ? {...this.pendingPayload, ...payload} : payload;
            
            // Небольшая задержка для проверки готовности
            await new Promise(resolve => setTimeout(resolve, 50));
            if (this.isReady && this.pendingPayload) {
                const finalPayload = this.pendingPayload;
                this.pendingPayload = null;
                await this.sendPayload(finalPayload);
            }
            return;
        }
        
        // Отправляем данные если окно готово
        await this.sendPayload(payload);
    }
    /**
     * Подписывается на обновления данных
     */
    onData(callback: (payload: ResultPayload) => void): () => void {
        console.log('[ResultWindowManager] Setting up data listener');
        const unlistenPromise = listen<ResultPayload>('result:data', (event) => {
            console.log('[ResultWindowManager] Received data event:', event.payload);
            callback(event.payload);
        });
        
        // Отправляем текущее состояние
        if (this.lastPayload) {
            console.log('[ResultWindowManager] Sending current state to subscriber');
            setTimeout(() => {
                callback(this.lastPayload!);
            }, 0);
        }
        
        // Отправляем историю событий
        if (this.eventHistory.length > 0) {
            console.log('[ResultWindowManager] Sending event history to subscriber');
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

