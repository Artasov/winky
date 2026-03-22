import React, {useCallback, useEffect, useState} from 'react';
import {getVersion} from '@tauri-apps/api/app';
import BugReportIcon from '@mui/icons-material/BugReport';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import BugReportModal from './feedback/BugReportModal';
import ChatModelSelect from '../features/chats/components/ChatModelSelect';
import {submitBugReport} from '../services/bugReport';
import {useConfig} from '../context/ConfigContext';
import {useThemeMode} from '../context/ThemeModeContext';
import {getSidebarCollapsed, subscribeSidebarCollapsed, toggleSidebarCollapsed} from '../services/sidebarState';
import {
    getChatTitleBarModelState,
    subscribeChatTitleBarModelState
} from '../services/chatTitleBarState';

interface TitleBarProps {
    title?: string;
    onClose?: () => void;
    showBugReportButton?: boolean;
    showSidebarToggle?: boolean;
}

const TitleBar: React.FC<TitleBarProps> = ({title = 'Winky', onClose, showBugReportButton = false, showSidebarToggle = false}) => {
    const {config} = useConfig();
    const {themeMode, isDark, toggleThemeMode} = useThemeMode();
    const accessToken = config?.auth?.access || config?.auth?.accessToken;
    const [isBugModalOpen, setBugModalOpen] = useState(false);
    const [version, setVersion] = useState<string>('');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => getSidebarCollapsed());
    const [chatModelState, setChatModelState] = useState(() => getChatTitleBarModelState());

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

    useEffect(() => subscribeSidebarCollapsed(setIsSidebarCollapsed), []);
    useEffect(() => subscribeChatTitleBarModelState(setChatModelState), []);

    return (
        <div
            className={`app-region-drag flex h-11 w-full items-center justify-between px-4 text-xs uppercase tracking-[0.3em] text-text-tertiary ${
                isDark
                    ? 'bg-transparent'
                    : 'bg-white/95 backdrop-blur'
            }`}
            aria-label={title}>
            <div className="frsc min-w-0 flex-1 gap-2">
                <div className="app-region-drag pointer-events-none select-none flex items-center gap-2">
                    <img
                        src="./resources/winky-pink-signature.png"
                        alt="Winky"
                        className="h-6 pointer-events-none"
                        draggable="false"
                        style={isDark ? {
                            filter: 'grayscale(100%) brightness(2) contrast(1.2)'
                        } : undefined}
                    />
                    {version ? (
                        <span style={{
                            marginBottom: -8,
                            marginLeft: -5,
                        }} className="text-[9px] font-light normal-case tracking-normal text-text-tertiary/80">
                            {version}
                        </span>
                    ) : null}
                </div>
                {showSidebarToggle ? (
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={toggleSidebarCollapsed}
                        className="app-region-no-drag flex h-7 w-7 items-center justify-center rounded-lg transition-[background-color,color] duration-base hover:bg-primary-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                        aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <MenuRoundedIcon
                            fontSize="small"
                            sx={{
                                transform: isSidebarCollapsed ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 220ms cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                        />
                    </button>
                ) : null}
                {chatModelState ? (
                    <div className="app-region-no-drag ml-3 min-w-0 flex-1 frc">
                        <ChatModelSelect
                            value={chatModelState.value}
                            options={chatModelState.options}
                            disabled={chatModelState.disabled}
                            onChange={chatModelState.onChange}
                            sx={{
                                minWidth: 180,
                                maxWidth: 280,
                                '& .MuiInputBase-root': {
                                    height: 30,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.92)',
                                    backdropFilter: 'blur(8px)',
                                    boxShadow: 'none',
                                },
                                '& .MuiSelect-select': {
                                    py: 0.25,
                                    fontSize: 12,
                                    fontWeight: 500,
                                    textTransform: 'none',
                                    letterSpacing: 'normal',
                                },
                                '& .MuiInputBase-input': {
                                    textTransform: 'none',
                                    letterSpacing: 'normal',
                                },
                                '& .MuiInputLabel-root, & .MuiFormLabel-root, & .MuiMenuItem-root': {
                                    textTransform: 'none',
                                    letterSpacing: 'normal',
                                }
                            }}
                        />
                    </div>
                ) : null}
            </div>
            <div className="app-region-no-drag flex items-center gap-2 text-text-secondary">
                {showBugReportButton ? (
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setBugModalOpen(true)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg transition-[background-color,color] duration-base hover:bg-primary-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                        aria-label="Report a problem"
                    >
                        <BugReportIcon fontSize="small" />
                    </button>
                ) : null}
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={toggleThemeMode}
                    className="flex h-7 w-7 items-center justify-center rounded-lg transition-[background-color,color] duration-base hover:bg-primary-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
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
                    className="flex h-7 w-7 items-center justify-center rounded-lg transition-[background-color,color] duration-base hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
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
                    className="flex h-7 w-7 items-center justify-center rounded-lg transition-[background-color,color] duration-base hover:bg-primary-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
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
