const SIDEBAR_COLLAPSED_STORAGE_KEY = 'winky.sidebar-collapsed';
const SIDEBAR_COLLAPSED_EVENT = 'winky:sidebar-collapsed-changed';

const emitSidebarCollapsed = () => {
    if (typeof window === 'undefined') {
        return;
    }
    window.dispatchEvent(new CustomEvent(SIDEBAR_COLLAPSED_EVENT));
};

export const getSidebarCollapsed = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }
    try {
        return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

export const setSidebarCollapsed = (collapsed: boolean): void => {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
        emitSidebarCollapsed();
    } catch {
        // ignore storage errors
    }
};

export const toggleSidebarCollapsed = (): void => {
    setSidebarCollapsed(!getSidebarCollapsed());
};

export const subscribeSidebarCollapsed = (listener: (collapsed: boolean) => void): (() => void) => {
    if (typeof window === 'undefined') {
        return () => undefined;
    }

    const handleStorage = (event: StorageEvent) => {
        if (event.key === SIDEBAR_COLLAPSED_STORAGE_KEY) {
            listener(getSidebarCollapsed());
        }
    };

    const handleChange = () => {
        listener(getSidebarCollapsed());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SIDEBAR_COLLAPSED_EVENT, handleChange);

    return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, handleChange);
    };
};
