import React from 'react';
import {Outlet} from 'react-router-dom';
import TitleBar from '../../components/TitleBar';
import Sidebar from '../../components/Sidebar';
import {useConfig} from '../../context/ConfigContext';
import {useThemeMode} from '../../context/ThemeModeContext';

interface DesktopShellProps {
    allowSidebar?: boolean;
}

const DesktopShell: React.FC<DesktopShellProps> = ({allowSidebar = false}) => {
    const {config} = useConfig();
    const {isDark} = useThemeMode();
    const hasToken = Boolean(config?.auth.access || config?.auth.accessToken);
    const showSidebar = allowSidebar && Boolean(config) && hasToken && config?.setupCompleted;
    const showAvatar = config?.showAvatarVideo !== false;

    return (
        <div
            className="fc h-full bg-bg-base text-text-primary relative"
            style={isDark ? {
                backgroundImage: 'url(./resources/dark_theme_bg.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
            } : undefined}
        >
            {isDark && showAvatar && (
                <img
                    src="./resources/dark_avatar.png"
                    alt=""
                    className="absolute pointer-events-none select-none z-0"
                    draggable={false}
                    style={{
                        left: -130,
                        bottom: -40,
                        width: 500,
                        height: 'auto'
                    }}
                />
            )}
            <TitleBar showBugReportButton/>
            <div className="fr flex-1 overflow-hidden relative z-10">
                {showSidebar ? <Sidebar/> : null}
                <main
                    className="flex-1 overflow-hidden"
                    style={!isDark ? {backgroundColor: '#fffafb'} : undefined}
                >
                    <div className="h-full overflow-y-auto">
                        <Outlet/>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DesktopShell;
