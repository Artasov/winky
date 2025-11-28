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

        console.error('[clipboardBridge] All clipboard methods failed');
        return false;
    }
};
