import React from 'react';

interface TitleBarProps {
    title?: string;
    onClose?: () => void;
}

const TitleBar: React.FC<TitleBarProps> = ({title = 'Winky', onClose}) => {
    const handleMinimize = () => {
        window.winky?.windowControls.minimize().catch((error) => {
            console.error('[TitleBar] Failed to minimize window', error);
        });
    };

    const handleClose = () => {
        if (onClose) {
            onClose();
        } else {
            window.winky?.windowControls.close().catch((error) => {
                console.error('[TitleBar] Failed to close window', error);
            });
        }
    };

    return (
        <div
            className="app-region-drag flex h-16 w-full items-center justify-between border-b border-primary-200/60 bg-white/95 px-4 text-xs uppercase tracking-[0.3em] text-text-tertiary backdrop-blur shadow-sm"
            aria-label={title}>
            <div className="app-region-drag pointer-events-none select-none flex items-center">
                <img src="./resources/winky-pink-signature.png" alt="Winky" className="h-10 pointer-events-none pt-1"
                     draggable="false"/>
            </div>
            <div className="app-region-no-drag flex items-center gap-2 text-text-secondary">
                <button
                    type="button"
                    onClick={handleMinimize}
                    tabIndex={-1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-[background-color,color] duration-base hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                    aria-label="Minimize"
                >
                    <svg viewBox="0 0 12 2" className="h-2 w-3 fill-current">
                        <rect width="12" height="2" rx="1"/>
                    </svg>
                </button>
                <button
                    type="button"
                    onClick={handleClose}
                    tabIndex={-1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-[background-color,color] duration-base hover:bg-primary-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                    aria-label="Close"
                >
                    <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                        <path
                            d="M1.28 0 0 1.28 4.72 6 0 10.72 1.28 12 6 7.28 10.72 12 12 10.72 7.28 6 12 1.28 10.72 0 6 4.72Z"/>
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default TitleBar;
