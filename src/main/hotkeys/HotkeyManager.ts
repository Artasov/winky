import {globalShortcut} from 'electron';

type EmitFunction = (channel: string, payload?: any) => void;

type RegisterResult = 'success' | 'invalid' | 'register-failed';

export class HotkeyManager {
    private registered: Map<string, string> = new Map();

    constructor(private readonly emit: EmitFunction) {}

    registerMicShortcut(accelerator: string, onTrigger: () => void): RegisterResult {
        if (this.registered.has('mic')) {
            const prevAccelerator = this.registered.get('mic');
            if (prevAccelerator) {
                globalShortcut.unregister(prevAccelerator);
            }
            this.registered.delete('mic');
        }

        const normalized = this.toElectronAccelerator(accelerator);
        if (!normalized) {
            this.emit('hotkey:register-error', {source: 'mic', accelerator, reason: 'invalid'});
            return 'invalid';
        }

        const success = globalShortcut.register(normalized, onTrigger);
        if (!success) {
            this.emit('hotkey:register-error', {
                source: 'mic',
                accelerator,
                electronAccelerator: normalized,
                reason: 'register-failed'
            });
            return 'register-failed';
        }

        this.registered.set('mic', normalized);
        this.emit('hotkey:register-success', {
            source: 'mic',
            accelerator,
            electronAccelerator: normalized
        });
        return 'success';
    }

    clearMicShortcut(): void {
        const existing = this.registered.get('mic');
        if (existing) {
            globalShortcut.unregister(existing);
            this.registered.delete('mic');
        }
        this.emit('hotkey:register-cleared', {source: 'mic'});
    }

    unregisterAll(): void {
        for (const accelerator of this.registered.values()) {
            globalShortcut.unregister(accelerator);
        }
        this.registered.clear();
    }

    private toElectronAccelerator(accelerator: string): string | null {
        if (!accelerator) {
            return null;
        }
        const parts = accelerator.split('+').map((part) => part.trim()).filter(Boolean);
        if (parts.length === 0) {
            return null;
        }

        const mapped: string[] = [];
        let hasKey = false;

        parts.forEach((part) => {
            const upper = part.toUpperCase();
            switch (upper) {
                case 'CTRL':
                case 'CONTROL':
                    mapped.push(process.platform === 'darwin' ? 'Command' : 'Control');
                    break;
                case 'COMMANDORCONTROL':
                case 'CMDORCTRL':
                case 'CMDORCONTROL':
                    mapped.push('CommandOrControl');
                    break;
                case 'CMD':
                case 'COMMAND':
                    mapped.push('Command');
                    break;
                case 'ALT':
                case 'OPTION':
                    mapped.push('Alt');
                    break;
                case 'SHIFT':
                    mapped.push('Shift');
                    break;
                case 'SUPER':
                case 'WIN':
                case 'META':
                    mapped.push('Super');
                    break;
                default: {
                    hasKey = true;
                    mapped.push(part.length === 1 ? part.toUpperCase() : part);
                }
            }
        });

        if (!hasKey) {
            return null;
        }

        return mapped.join('+');
    }
}
