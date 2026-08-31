import {authClient, normalizeAuthError} from './authClient';

const TRANSCRIPTION_TIMEOUT_MS = 120_000;

type WinkyTranscriptionLevel = 'low' | 'high';

type MediaDirectUploadResponse = {
    media_file: {
        id: number;
        status: string;
    };
    already_uploaded: boolean;
};

export type WinkyTranscribeResult = {
    id: string;
    text: string;
    model_level: WinkyTranscriptionLevel;
    credits: string;
    language?: string | null;
    created_at: string;
};

export type WinkyTranscribeOptions = {
    language?: string;
    mimeType?: string;
    model?: WinkyTranscriptionLevel;
    signal?: AbortSignal;
    timeoutMs?: number;
};

export class WinkyTranscriptionService {
    async transcribe(
        audio: ArrayBuffer,
        options: WinkyTranscribeOptions = {}
    ): Promise<WinkyTranscribeResult> {
        const controller = new AbortController();
        const timeoutMs = Math.max(5_000, options.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS);
        let timedOut = false;
        let clearExternalAbort: (() => void) | null = null;
        if (options.signal) {
            const forwardAbort = () => controller.abort(options.signal?.reason);
            if (options.signal.aborted) {
                forwardAbort();
            } else {
                options.signal.addEventListener('abort', forwardAbort, {once: true});
                clearExternalAbort = () => options.signal?.removeEventListener('abort', forwardAbort);
            }
        }
        const timeoutId = setTimeout(() => {
            if (controller.signal.aborted) return;
            timedOut = true;
            controller.abort(new DOMException('Transcription request timed out.', 'AbortError'));
        }, timeoutMs);
        const mimeType = options.mimeType || 'audio/webm';
        const originalName = `winky-recording.${this.getExtension(mimeType)}`;
        let mediaFileId: number | null = null;
        let createdUpload = false;

        try {
            await this.runWithSignal(authClient.loadSession(), controller.signal);
            const sha256 = await this.runWithSignal(this.getSha256(audio), controller.signal);
            const upload = await this.runWithSignal(authClient.authenticatedRequest<MediaDirectUploadResponse>({
                method: 'POST',
                url: 'media/uploads/',
                data: {
                    namespace: 'ai/transcribe',
                    original_name: originalName,
                    content_type: mimeType,
                    size: audio.byteLength,
                    sha256,
                    visibility: 'private'
                },
                signal: controller.signal,
                timeout: timeoutMs
            }), controller.signal);
            mediaFileId = upload.media_file.id;
            createdUpload = !upload.already_uploaded;

            if (createdUpload) {
                await this.runWithSignal(authClient.authenticatedRequest<void>({
                    method: 'PUT',
                    url: `media/uploads/${mediaFileId}/content/`,
                    data: audio,
                    headers: {'Content-Type': mimeType},
                    signal: controller.signal,
                    timeout: timeoutMs
                }), controller.signal);
                await this.runWithSignal(authClient.authenticatedRequest<void>({
                    method: 'POST',
                    url: `media/uploads/${mediaFileId}/complete/`,
                    signal: controller.signal,
                    timeout: timeoutMs
                }), controller.signal);
            }

            return await this.runWithSignal(authClient.authenticatedRequest<WinkyTranscribeResult>({
                method: 'POST',
                url: 'ai/transcribe/media/',
                data: {
                    media_file_id: mediaFileId,
                    language: options.language || null,
                    model: options.model || 'high'
                },
                signal: controller.signal,
                timeout: timeoutMs
            }), controller.signal);
        } catch (error) {
            if (createdUpload && mediaFileId !== null) {
                void this.removeUpload(mediaFileId);
            }
            if (timedOut) {
                const timeoutError = new Error('Transcription timed out. Please try a shorter recording.');
                timeoutError.name = 'TimeoutError';
                throw timeoutError;
            }
            throw normalizeAuthError(error);
        } finally {
            clearTimeout(timeoutId);
            clearExternalAbort?.();
        }
    }

    private runWithSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
        if (signal.aborted) {
            void operation.catch(() => undefined);
            return Promise.reject(this.getAbortError(signal));
        }
        return new Promise<T>((resolve, reject) => {
            let settled = false;
            const handleAbort = () => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', handleAbort);
                reject(this.getAbortError(signal));
            };

            signal.addEventListener('abort', handleAbort, {once: true});
            operation.then(
                (value) => {
                    if (settled) return;
                    settled = true;
                    signal.removeEventListener('abort', handleAbort);
                    resolve(value);
                },
                (error) => {
                    if (settled) return;
                    settled = true;
                    signal.removeEventListener('abort', handleAbort);
                    reject(error);
                }
            );
        });
    }

    private getAbortError(signal: AbortSignal): Error {
        return signal.reason instanceof Error
            ? signal.reason
            : new DOMException('Aborted', 'AbortError');
    }

    private async removeUpload(mediaFileId: number): Promise<void> {
        try {
            await authClient.authenticatedRequest<void>({
                method: 'DELETE',
                url: `media/uploads/${mediaFileId}/`,
                timeout: 15_000
            });
        } catch (error) {
            const normalized = normalizeAuthError(error);
            console.warn('[transcription] Failed to clean up media upload', {
                mediaFileId,
                status: normalized.status,
                code: normalized.code
            });
        }
    }

    private async getSha256(audio: ArrayBuffer): Promise<string> {
        const digest = await crypto.subtle.digest('SHA-256', audio);
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    private getExtension(mimeType: string): string {
        if (mimeType.includes('wav')) return 'wav';
        if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
        if (mimeType.includes('ogg')) return 'ogg';
        if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
        return 'webm';
    }
}

export const winkyTranscriptionService = new WinkyTranscriptionService();
