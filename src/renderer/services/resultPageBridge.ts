/**
 * Мост для управления страницей результата внутри главного окна
 * Использует глобальные события для связи с ResultContext
 */

export interface ResultPagePayload {
    transcription?: string;
    llmResponse?: string;
    isStreaming?: boolean;
}

type ResultEventCallback = (payload: ResultPagePayload) => void;

class ResultPageBridge {
    private listeners: Set<ResultEventCallback> = new Set();
    private currentPayload: ResultPagePayload | null = null;
    private isOpen = false;

    /**
     * Открывает страницу результата и очищает предыдущие данные
     */
    open(): void {
        this.currentPayload = {transcription: '', llmResponse: '', isStreaming: false};
        this.isOpen = true;
        this.emit({...this.currentPayload, _open: true} as any);

        // Эмитируем событие для навигации
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('result-page:open'));
        }
    }

    /**
     * Закрывает страницу результата
     */
    close(): void {
        this.isOpen = false;
        this.currentPayload = null;
        this.emit({_close: true} as any);

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('result-page:close'));
        }
    }

    /**
     * Обновляет данные на странице результата
     */
    update(payload: ResultPagePayload): void {
        if (!this.currentPayload) {
            this.currentPayload = {transcription: '', llmResponse: '', isStreaming: false};
        }
        this.currentPayload = {...this.currentPayload, ...payload};
        this.emit(payload);
    }

    /**
     * Подписывается на обновления данных
     */
    subscribe(callback: ResultEventCallback): () => void {
        this.listeners.add(callback);

        // Отправляем текущее состояние новому подписчику
        if (this.currentPayload) {
            setTimeout(() => callback(this.currentPayload!), 0);
        }

        return () => {
            this.listeners.delete(callback);
        };
    }

    /**
     * Получает текущее состояние
     */
    getState(): {isOpen: boolean; payload: ResultPagePayload | null} {
        return {isOpen: this.isOpen, payload: this.currentPayload};
    }

    private emit(payload: ResultPagePayload): void {
        this.listeners.forEach((cb) => {
            try {
                cb(payload);
            } catch (error) {
                console.error('[ResultPageBridge] Listener error:', error);
            }
        });
    }
}

export const resultPageBridge = new ResultPageBridge();
