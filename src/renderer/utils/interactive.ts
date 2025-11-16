let hoverCount = 0;
let disableTimeout: ReturnType<typeof setTimeout> | null = null;
let transientTimeout: ReturnType<typeof setTimeout> | null = null;

const applyInteractive = () => {
    if (hoverCount > 0) {
        if (disableTimeout) {
            clearTimeout(disableTimeout);
            disableTimeout = null;
        }
        void window.winky?.mic?.setInteractive(true);
    } else {
        if (disableTimeout) {
            return;
        }
        disableTimeout = setTimeout(() => {
            disableTimeout = null;
            if (hoverCount === 0) {
                void window.winky?.mic?.setInteractive(false);
            }
        }, 80);
    }
};

export const interactiveEnter = () => {
    hoverCount += 1;
    applyInteractive();
};

export const interactiveLeave = () => {
    if (hoverCount > 0) {
        hoverCount -= 1;
        applyInteractive();
    }
};

export const resetInteractive = () => {
    hoverCount = 0;
    if (disableTimeout) {
        clearTimeout(disableTimeout);
        disableTimeout = null;
    }
    if (transientTimeout) {
        clearTimeout(transientTimeout);
        transientTimeout = null;
    }
    const button = (typeof document !== 'undefined')
        ? document.querySelector('[data-mic-button="true"]')
        : null;
    const isHovered = button instanceof HTMLElement && button.matches(':hover');
    if (isHovered) {
        hoverCount = 1;
        void window.winky?.mic?.setInteractive(true);
    } else {
        void window.winky?.mic?.setInteractive(false);
    }
};

export const requestTransientInteractive = (duration = 800) => {
    if (hoverCount > 0) {
        return;
    }
    void window.winky?.mic?.setInteractive(true);
    if (transientTimeout) {
        clearTimeout(transientTimeout);
    }
    transientTimeout = setTimeout(() => {
        transientTimeout = null;
        if (hoverCount === 0) {
            void window.winky?.mic?.setInteractive(false);
        }
    }, duration);
};
