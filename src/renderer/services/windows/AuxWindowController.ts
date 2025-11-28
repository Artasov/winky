import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {emit} from '@tauri-apps/api/event';

/**
 * Контроллер для управления вспомогательными окнами Tauri
 */
export class AuxWindowController {
    private window: WebviewWindow | null = null;

    constructor(
        private readonly label: string,
        private readonly route: string,
        private readonly options?: Record<string, unknown>
    ) {}

    private buildUrl(): string {
        const base = window.location.href.split('#')[0].split('?')[0];
        const searchParams = new URLSearchParams({window: this.label});
        return `${base}?${searchParams.toString()}#${this.route}`;
    }

    async ensure(): Promise<WebviewWindow> {
        if (this.window) {
            return this.window;
        }
        const existing = await WebviewWindow.getByLabel(this.label).catch(() => null);
        if (existing) {
            this.window = existing;
            return existing;
        }
        const win = new WebviewWindow(this.label, {
            url: this.buildUrl(),
            title: 'Winky',
            focus: false,
            ...(this.options ?? {})
        } as any);
        await new Promise<void>((resolve, reject) => {
            win.once('tauri://created', () => resolve());
            win.once('tauri://error', ({payload}) => reject(payload));
        });
        void win.once('tauri://destroyed', () => {
            this.window = null;
        });
        this.window = win;
        return win;
    }

    async open(_payload?: unknown): Promise<void> {
        // payload пока не используется; окно просто показывается
        await this.show();
    }

    async show(): Promise<void> {
        const win = await this.ensure();
        await win.show();
        await win.setFocus();
    }

    async hide(): Promise<void> {
        if (!this.window) {
            return;
        }
        try {
            await this.window.hide();
        } catch {
            this.window = null;
        }
    }

    async close(): Promise<void> {
        if (!this.window) {
            return;
        }
        try {
            await this.window.close();
        } catch {
            /* ignore */
        } finally {
            this.window = null;
        }
    }

    async emitEvent<T>(event: string, payload: T): Promise<void> {
        await emit(event, payload);
    }
}

