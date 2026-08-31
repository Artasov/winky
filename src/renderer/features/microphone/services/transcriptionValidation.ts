const KNOWN_WHISPER_HALLUCINATIONS = [
    'hostname, and email are included in the link below.',
    'like and subscribe',
    'امیدوارم که این ویدیو',
    'ご視聴ありがとうございました',
    '字幕by',
    'subtitle by',
    'transcript by',
    'captioning by',
    'www.mooji.org'
] as const;

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export const isValidTranscription = (text: string, prompt?: string): boolean => {
    const normalizedText = normalizeText(text);
    if (!normalizedText || !/[\p{L}\p{N}]/u.test(normalizedText)) return false;

    const hasKnownHallucination = KNOWN_WHISPER_HALLUCINATIONS.some((hallucination) => {
        const normalizedHallucination = normalizeText(hallucination);
        return normalizedText === normalizedHallucination || normalizedText.includes(normalizedHallucination);
    });
    if (hasKnownHallucination) return false;

    const normalizedPrompt = normalizeText(prompt ?? '');
    if (!normalizedPrompt) return true;
    if (normalizedText === normalizedPrompt) return false;

    const shorterLength = Math.min(normalizedText.length, normalizedPrompt.length);
    const longerLength = Math.max(normalizedText.length, normalizedPrompt.length);
    const overlapRatio = shorterLength / Math.max(1, longerLength);
    const oneContainsAnother = normalizedText.includes(normalizedPrompt) || normalizedPrompt.includes(normalizedText);
    return !oneContainsAnother || overlapRatio < 0.9;
};
