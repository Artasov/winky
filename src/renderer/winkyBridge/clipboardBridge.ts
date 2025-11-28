import {invoke} from '@tauri-apps/api/core';
import {writeText as writeClipboardText} from '@tauri-apps/plugin-clipboard-manager';

export const clipboardBridge = {
    writeText: async (text: string) => {
        const payload = text ?? '';
        if (!payload) {
            console.warn('[clipboardBridge] Empty text provided, skipping copy');
            return false;
        }

        try {
            await writeClipboardText(payload);
            return true;
        } catch (error) {
            console.debug('[clipboardBridge] Tauri clipboard API failed, trying fallback:', error);
        }

        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(payload);
                return true;
            }
        } catch (error) {
            console.debug('[clipboardBridge] Navigator clipboard API failed:', error);
        }

        try {
            if (typeof document !== 'undefined') {
                const textArea = document.createElement('textarea');
                textArea.value = payload;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) {
                    return true;
                }
            }
        } catch (error) {
            console.debug('[clipboardBridge] execCommand fallback failed:', error);
        }

        console.error('[clipboardBridge] All clipboard methods failed');
        return false;
    }
};

export type ClipboardBridge = typeof clipboardBridge;
