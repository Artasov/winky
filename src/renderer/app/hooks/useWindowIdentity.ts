import {useMemo} from 'react';

export type WindowKind = 'main' | 'settings' | 'mic' | 'result' | 'error';

export interface WindowIdentity {
    kind: WindowKind;
    isAuxWindow: boolean;
    isMicWindow: boolean;
    isResultWindow: boolean;
    isErrorWindow: boolean;
    allowsToasts: boolean;
}

const allowedKinds: WindowKind[] = ['main', 'settings', 'mic', 'result', 'error'];

const resolveWindowKind = (): WindowKind => {
    if (typeof window === 'undefined') {
        return 'main';
    }
    const params = new URLSearchParams(window.location.search);
    const param = params.get('window');
    if (param && allowedKinds.includes(param as WindowKind)) {
        return param as WindowKind;
    }
    return 'main';
};

export const useWindowIdentity = (): WindowIdentity => {
    return useMemo(() => {
        const kind = resolveWindowKind();
        const isMicWindow = kind === 'mic';
        const isResultWindow = kind === 'result';
        const isErrorWindow = kind === 'error';
        return {
            kind,
            isAuxWindow: kind !== 'main',
            isMicWindow,
            isResultWindow,
            isErrorWindow,
            allowsToasts: !isMicWindow && !isResultWindow && !isErrorWindow
        };
    }, []);
};
