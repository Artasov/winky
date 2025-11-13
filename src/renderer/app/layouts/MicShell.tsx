import React from 'react';
import {Outlet} from 'react-router-dom';

const MicShell: React.FC = () => (
    <div className="frcc h-full w-full bg-transparent text-white">
        <Outlet/>
    </div>
);

export default MicShell;
