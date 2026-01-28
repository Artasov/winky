import React, {useCallback, useEffect, useState} from 'react';
import {getVersion} from '@tauri-apps/api/app';
import BugReportIcon from '@mui/icons-material/BugReport';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import BugReportModal from './feedback/BugReportModal';
import {submitBugReport} from '../services/bugReport';
import {useConfig} from '../context/ConfigContext';
import {useThemeMode} from '../context/ThemeModeContext';

interface TitleBarProps {
    title?: string;
    onClose?: () => void;
    showBugReportButton?: boolean;
}

const TitleBar: React.FC<TitleBarProps> = ({title = 'Winky', onClose, showBugReportButton = false}) => {
    const {config} = useConfig();
    const {themeMode, isDark, toggleThemeMode} = useThemeMode();
    const accessToken = config?.auth?.access || config?.auth?.accessToken;
    const [isBugModalOpen, setBugModalOpen] = useState(false);
    const [version, setVersion] = useState<string>('');

    const handleBugSubmit = useCallback(
        (payload: Parameters<typeof submitBugReport>[0]) => submitBugReport(payload, accessToken),
        [accessToken]
    );

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

    useEffect(() => {
        getVersion()
            .then(setVersion)
            .catch(() => setVersion(''));
    }, []);

    return (
        <div
            className={`app-region-drag flex h-16 w-full items-center justify-between border-b px-4 text-xs uppercase tracking-[0.3em] text-text-tertiary ${
                isDark
                    ? 'border-white/15 bg-transparent'
                    : 'border-primary-200/60 bg-white/95 backdrop-blur shadow-sm'
            }`}
            aria-label={title}>
            <div className="app-region-drag pointer-events-none select-none flex items-center gap-2">
                <img
                    src="./resources/winky-pink-signature.png"
                    alt="Winky"
                    className="h-10 pointer-events-none pt-1"
                    draggable="false"
                    style={isDark ? {
                        filter: 'grayscale(100%) brightness(2) contrast(1.2)'
                    } : undefined}
                />
                {version ? (
                    <span style={{
                        marginBottom: -12,
                        marginLeft: -7,
                    }} className="text-[10px] font-light normal-case tracking-normal text-text-tertiary/80">
                        {version}
                    </span>
                ) : null}
            </div>
            <div className="app-region-no-drag flex items-center gap-2 text-text-secondary">
                {showBugReportButton ? (
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setBugModalOpen(true)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg transition-[background-color,color] duration-base hover:bg-primary-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                        aria-label="Report a problem"
                    >
                        <BugReportIcon fontSize="small" />
                    </button>
                ) : null}
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={toggleThemeMode}
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-[background-color,color] duration-base hover:bg-primary-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                    aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                    title={isDark ? 'Light theme' : 'Dark theme'}
                    data-theme-mode={themeMode}
                >
                    {isDark ? <LightModeIcon fontSize="small"/> : <DarkModeIcon fontSize="small"/>}
                </button>
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
            {showBugReportButton ? (
                <BugReportModal
                    open={isBugModalOpen}
                    onClose={() => setBugModalOpen(false)}
                    onSubmit={handleBugSubmit}
                />
            ) : null}
        </div>
    );
};

export default TitleBar;
