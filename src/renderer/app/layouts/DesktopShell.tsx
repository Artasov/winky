import React from 'react';
import {Outlet} from 'react-router-dom';
import TitleBar from '../../components/TitleBar';
import Sidebar from '../../components/Sidebar';
import {useConfig} from '../../context/ConfigContext';

interface DesktopShellProps {
    allowSidebar?: boolean;
}

const DesktopShell: React.FC<DesktopShellProps> = ({allowSidebar = false}) => {
    const {config} = useConfig();
    const hasToken = Boolean(config?.auth.access || config?.auth.accessToken);
    const showSidebar = allowSidebar && Boolean(config) && hasToken && config?.setupCompleted;

    return (
        <div className="fc disable-tap-select h-full bg-bg-base text-text-primary">
            <TitleBar/>
            <div className="fr flex-1 overflow-hidden">
                {showSidebar ? <Sidebar/> : null}
                <main className="flex-1 overflow-hidden bg-bg-secondary/50">
                    <div className="h-full overflow-auto">
                        <Outlet/>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DesktopShell;
