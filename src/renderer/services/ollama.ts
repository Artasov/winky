const downloadingModels = new Set<string>();
const warmingModels = new Set<string>();
const downloadListeners = new Set<(models: Set<string>) => void>();
const warmupListeners = new Set<(models: Set<string>) => void>();

const notifyDownloads = () => {
    const snapshot = new Set(downloadingModels);
    downloadListeners.forEach((listener) => {
        try {
            listener(snapshot);
        } catch (error) {
            console.error('[ollama] download listener error', error);
        }
    });
};

const notifyWarmup = () => {
    const snapshot = new Set(warmingModels);
    warmupListeners.forEach((listener) => {
        try {
            listener(snapshot);
        } catch (error) {
            console.error('[ollama] warmup listener error', error);
        }
    });
};

export const normalizeOllamaModelName = (model: string): string => model?.trim().toLowerCase() || '';


const setDownloading = (model: string, active: boolean) => {
    const normalized = normalizeOllamaModelName(model);
    if (!normalized) {
        return;
    }
    if (active) {
        downloadingModels.add(normalized);
    } else {
        downloadingModels.delete(normalized);
    }
    notifyDownloads();
};

const setWarming = (model: string, active: boolean) => {
    const normalized = normalizeOllamaModelName(model);
    if (!normalized) {
        return;
    }
    if (active) {
        warmingModels.add(normalized);
    } else {
        warmingModels.delete(normalized);
    }
    notifyWarmup();
};

export const subscribeToOllamaDownloads = (
    listener: (models: Set<string>) => void
): (() => void) => {
    downloadListeners.add(listener);
    listener(new Set(downloadingModels));
    return () => {
        downloadListeners.delete(listener);
    };
};

export const subscribeToOllamaWarmup = (listener: (models: Set<string>) => void): (() => void) => {
    warmupListeners.add(listener);
    listener(new Set(warmingModels));
    return () => {
        warmupListeners.delete(listener);
    };
};

export const downloadOllamaModel = async (model: string): Promise<void> => {
    const normalized = normalizeOllamaModelName(model);
    if (!normalized) {
        throw new Error('Model name is required.');
    }
    setDownloading(normalized, true);
    try {
        await window.winky?.ollama?.pullModel?.(model);
    } finally {
        setDownloading(normalized, false);
    }
};

export const warmupOllamaModel = async (model: string): Promise<void> => {
    const normalized = normalizeOllamaModelName(model);
    if (!normalized) {
        throw new Error('Model name is required.');
    }
    setWarming(normalized, true);
    try {
        await window.winky?.ollama?.warmupModel?.(model);
    } finally {
        setWarming(normalized, false);
    }
};
