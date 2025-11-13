import React from 'react';
import {Outlet} from 'react-router-dom';

const ErrorShell: React.FC = () => (
    <div className="fc disable-tap-select h-full w-full bg-bg-base text-text-primary">
        <Outlet/>
    </div>
);

export default ErrorShell;
