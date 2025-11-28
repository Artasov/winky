export const micBridge = {
    hide(options?: {reason?: string; disableAutoShow?: boolean}): Promise<void> {
        return window.winky?.mic?.hide?.(options) ?? Promise.resolve();
    },
    show(reason?: string): Promise<void> {
        return window.winky?.mic?.show?.(reason) ?? Promise.resolve();
    },
    toggle(reason?: string): Promise<void> {
        return window.winky?.mic?.toggle?.(reason) ?? Promise.resolve();
    },
    moveWindow(x: number, y: number): Promise<void> {
        return window.winky?.mic?.moveWindow?.(x, y) ?? Promise.resolve();
    },
    moveBy(dx: number, dy: number): Promise<void> {
        return window.winky?.mic?.moveBy?.(dx, dy) ?? Promise.resolve();
    }
};
