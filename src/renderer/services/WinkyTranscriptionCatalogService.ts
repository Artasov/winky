import axios from 'axios';
import {z} from 'zod';
import {authClient} from './authClient';

const CATALOG_CACHE_MS = 5 * 60_000;

const catalogSchema = z.object({
    group_label: z.string().min(1),
    options: z.array(z.object({
        level: z.enum(['low', 'high']),
        name: z.string().min(1),
        credits_per_minute: z.string().min(1)
    }))
});

export type WinkyTranscriptionCatalog = z.infer<typeof catalogSchema>;

export class WinkyTranscriptionCatalogService {
    private cached: WinkyTranscriptionCatalog | null = null;
    private cachedAt = 0;
    private cachedApiBaseUrl = '';
    private request: {apiBaseUrl: string; promise: Promise<WinkyTranscriptionCatalog>} | null = null;

    async get(force: boolean = false): Promise<WinkyTranscriptionCatalog> {
        await authClient.loadSession();
        const apiBaseUrl = authClient.getApiBaseUrl();
        if (
            !force
            && this.cached
            && this.cachedApiBaseUrl === apiBaseUrl
            && Date.now() - this.cachedAt < CATALOG_CACHE_MS
        ) {
            return this.cached;
        }
        if (this.request?.apiBaseUrl === apiBaseUrl) return this.request.promise;

        const promise = this.fetch(apiBaseUrl).finally(() => {
            if (this.request?.promise === promise) this.request = null;
        });
        this.request = {apiBaseUrl, promise};
        return promise;
    }

    private async fetch(apiBaseUrl: string): Promise<WinkyTranscriptionCatalog> {
        const response = await axios.get(`${apiBaseUrl}/ai/transcriptions/config/`, {
            timeout: 10_000
        });
        const catalog = catalogSchema.parse(response.data);
        this.cached = catalog;
        this.cachedAt = Date.now();
        this.cachedApiBaseUrl = apiBaseUrl;
        return catalog;
    }
}

export const winkyTranscriptionCatalogService = new WinkyTranscriptionCatalogService();
