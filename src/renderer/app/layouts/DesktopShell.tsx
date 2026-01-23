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
        <div className="fc h-full bg-bg-base text-text-primary">
            <TitleBar showBugReportButton/>
            <div className="fr flex-1 overflow-hidden">
                {showSidebar ? <Sidebar/> : null}
                <main className="flex-1 overflow-hidden" style={{
                    backgroundColor: '#fffafb'
                }}>
                    <div className="h-full overflow-y-auto">
                        <Outlet/>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DesktopShell;
