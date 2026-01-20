import React, {useCallback, useEffect, useState} from 'react';
import {getVersion} from '@tauri-apps/api/app';
import {useNavigate, useLocation} from 'react-router-dom';
import classNames from 'classnames';
import {Collapse} from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoIcon from '@mui/icons-material/Info';
import BugReportModal from './feedback/BugReportModal';
import {submitBugReport} from '../services/bugReport';
import {useConfig} from '../context/ConfigContext';
import {useUser} from '../context/UserContext';

interface TitleBarProps {
    title?: string;
    onClose?: () => void;
    showBugReportButton?: boolean;
}

const TitleBar: React.FC<TitleBarProps> = ({title = 'Winky', onClose, showBugReportButton = false}) => {
    const {config} = useConfig();
    const {user, loading: userLoading} = useUser();
    const navigate = useNavigate();
    const location = useLocation();
    const accessToken = config?.auth?.access || config?.auth?.accessToken;
    const [isBugModalOpen, setBugModalOpen] = useState(false);
    const [version, setVersion] = useState<string>('');
    const [showLabels, setShowLabels] = useState(false);

    const isSettingsPage = location.pathname === '/settings';
    const isInfoPage = location.pathname === '/info';
    const isAuthorized = Boolean(accessToken && user);

    useEffect(() => {
        // Запускаем анимацию только когда пользователь авторизован и загружен
        if (!isAuthorized || userLoading) {
            setShowLabels(false);
            return;
        }

        // Задержка 200ms перед началом показа надписей
        const showTimer = setTimeout(() => {
            setShowLabels(true);
        }, 200);

        // Скрываем через 2 секунды после показа (200 + 2000 = 2200ms)
        const hideTimer = setTimeout(() => {
            setShowLabels(false);
        }, 2200);

        return () => {
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
        };
    }, [isAuthorized, userLoading]);

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
            className="app-region-drag flex h-16 w-full items-center justify-between border-b border-primary-200/60 bg-white/95 px-4 text-xs uppercase tracking-[0.3em] text-text-tertiary backdrop-blur shadow-sm"
            aria-label={title}>
            <div className="app-region-drag pointer-events-none select-none flex items-center gap-2">
                <img src="./resources/winky-pink-signature.png" alt="Winky" className="h-10 pointer-events-none pt-1"
                     draggable="false"/>
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
                {isAuthorized && (
                    <>
                        <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => navigate('/settings')}
                            className={classNames(
                                'flex h-8 items-center justify-center rounded-lg transition-all duration-base hover:bg-primary-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light',
                                isSettingsPage && 'bg-primary-100 text-primary'
                            )}
                            style={{
                                paddingLeft: '8px',
                                paddingRight: '8px'
                            }}
                            aria-label="Settings"
                        >
                            <SettingsIcon fontSize="small" sx={{flexShrink: 0}} />
                            <Collapse orientation="horizontal" in={showLabels} timeout={500}>
                                <span
                                    className="whitespace-nowrap"
                                    style={{
                                        marginLeft: '6px',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        letterSpacing: '-0.02em'
                                    }}
                                >
                                    Settings
                                </span>
                            </Collapse>
                        </button>
                        <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => navigate('/info')}
                            className={classNames(
                                'flex h-8 items-center justify-center rounded-lg transition-all duration-base hover:bg-primary-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light',
                                isInfoPage && 'bg-primary-100 text-primary'
                            )}
                            style={{
                                paddingLeft: '8px',
                                paddingRight: '8px'
                            }}
                            aria-label="Info"
                        >
                            <InfoIcon fontSize="small" sx={{flexShrink: 0}} />
                            <Collapse orientation="horizontal" in={showLabels} timeout={500}>
                                <span
                                    className="whitespace-nowrap"
                                    style={{
                                        marginLeft: '6px',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        letterSpacing: '-0.02em'
                                    }}
                                >
                                    Info
                                </span>
                            </Collapse>
                        </button>
                    </>
                )}
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
