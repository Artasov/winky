import type {BrowserWindow} from 'electron';

export interface WindowController {
    readonly id: string;
    getWindow(): BrowserWindow | null;
    destroy(): void;
}
