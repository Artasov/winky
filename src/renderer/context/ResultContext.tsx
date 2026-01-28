import React, {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {resultPageBridge} from '../services/resultPageBridge';

export interface ResultData {
    transcription: string;
    llmResponse: string;
    isStreaming: boolean;
}

interface ResultContextValue {
    data: ResultData | null;
    isActive: boolean;
    setData: (data: Partial<ResultData>) => void;
    clear: () => void;
    open: () => void;
}

const defaultValue: ResultContextValue = {
    data: null,
    isActive: false,
    setData: () => {},
    clear: () => {},
    open: () => {}
};

export const ResultContext = createContext<ResultContextValue>(defaultValue);

export const useResult = () => useContext(ResultContext);

interface ResultProviderProps {
    children: ReactNode;
}

export const ResultProvider: React.FC<ResultProviderProps> = ({children}) => {
    const [data, setDataState] = useState<ResultData | null>(null);
    const [isActive, setIsActive] = useState(false);

    const setData = useCallback((partial: Partial<ResultData>) => {
        setDataState((prev) => {
            const current = prev || {transcription: '', llmResponse: '', isStreaming: false};
            return {...current, ...partial};
        });
    }, []);

    const clear = useCallback(() => {
        setDataState(null);
        setIsActive(false);
        resultPageBridge.close();
    }, []);

    const open = useCallback(() => {
        setIsActive(true);
        setDataState({transcription: '', llmResponse: '', isStreaming: false});
    }, []);

    // Подписываемся на события от resultPageBridge
    useEffect(() => {
        const unsubscribe = resultPageBridge.subscribe((payload) => {
            if ((payload as any)._open) {
                setIsActive(true);
                setDataState({transcription: '', llmResponse: '', isStreaming: false});
                return;
            }
            if ((payload as any)._close) {
                setIsActive(false);
                setDataState(null);
                return;
            }
            setDataState((prev) => {
                const current = prev || {transcription: '', llmResponse: '', isStreaming: false};
                return {
                    ...current,
                    ...(payload.transcription !== undefined ? {transcription: payload.transcription} : {}),
                    ...(payload.llmResponse !== undefined ? {llmResponse: payload.llmResponse} : {}),
                    ...(payload.isStreaming !== undefined ? {isStreaming: payload.isStreaming} : {})
                };
            });
        });

        return unsubscribe;
    }, []);

    return (
        <ResultContext.Provider value={{data, isActive, setData, clear, open}}>
            {children}
        </ResultContext.Provider>
    );
};
