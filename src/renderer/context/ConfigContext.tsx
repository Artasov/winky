import {createContext, useContext} from 'react';
import type {AppConfig} from '@shared/types';

export interface ConfigContextValue {
    config: AppConfig | null;
    setConfig: (config: AppConfig) => void;
    refreshConfig: () => Promise<AppConfig>;
    updateConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>;
}

export const ConfigContext = createContext<ConfigContextValue | undefined>(undefined);

export const useConfig = (): ConfigContextValue => {
    const context = useContext(ConfigContext);
    if (!context) {
        throw new Error('useConfig must be used within ConfigProvider');
    }
    return context;
};
