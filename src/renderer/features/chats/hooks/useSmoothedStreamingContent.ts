import {useCallback, useEffect, useRef, useState} from 'react';

const MIN_CHARS_PER_FRAME = 8;
const MAX_CHARS_PER_FRAME = 72;

export interface UseSmoothedStreamingContentResult {
    streamingContent: string;
    appendStreamingChunk: (chunk: string) => void;
    flushStreamingContent: () => void;
    getStreamingContent: () => string;
    resetStreamingContent: () => void;
}

export const useSmoothedStreamingContent = (): UseSmoothedStreamingContentResult => {
    const [streamingContent, setStreamingContent] = useState('');

    const streamingContentRef = useRef('');
    const pendingContentRef = useRef('');
    const frameRef = useRef<number | null>(null);

    const flushStep = useCallback(() => {
        frameRef.current = null;
        if (!pendingContentRef.current) return;

        const nextChunkSize = Math.min(
            MAX_CHARS_PER_FRAME,
            Math.max(MIN_CHARS_PER_FRAME, Math.ceil(pendingContentRef.current.length / 5))
        );
        const nextContent = pendingContentRef.current.slice(0, nextChunkSize);
        pendingContentRef.current = pendingContentRef.current.slice(nextChunkSize);
        setStreamingContent((prev) => {
            const content = prev + nextContent;
            streamingContentRef.current = content;
            return content;
        });

        if (pendingContentRef.current) {
            frameRef.current = requestAnimationFrame(flushStep);
        }
    }, []);

    const appendStreamingChunk = useCallback((chunk: string) => {
        if (!chunk) return;
        pendingContentRef.current += chunk;
        if (frameRef.current === null) {
            frameRef.current = requestAnimationFrame(flushStep);
        }
    }, [flushStep]);

    const flushStreamingContent = useCallback(() => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
        if (!pendingContentRef.current) return;
        const pending = pendingContentRef.current;
        pendingContentRef.current = '';
        setStreamingContent((prev) => {
            const content = prev + pending;
            streamingContentRef.current = content;
            return content;
        });
    }, []);

    const getStreamingContent = useCallback(() => {
        return streamingContentRef.current + pendingContentRef.current;
    }, []);

    const resetStreamingContent = useCallback(() => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
        pendingContentRef.current = '';
        streamingContentRef.current = '';
        setStreamingContent('');
    }, []);

    useEffect(() => {
        return () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, []);

    return {
        streamingContent,
        appendStreamingChunk,
        flushStreamingContent,
        getStreamingContent,
        resetStreamingContent
    };
};

export default useSmoothedStreamingContent;
