import React from 'react';
import {Outlet} from 'react-router-dom';

const ResultShell: React.FC = () => (
    <div className="fc h-full w-full bg-bg-base text-text-primary">
        <Outlet/>
    </div>
);

export default ResultShell;
