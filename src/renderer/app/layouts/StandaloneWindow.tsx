import React from 'react';
import {Outlet} from 'react-router-dom';

const StandaloneWindow: React.FC = () => (
    <div className="fc disable-tap-select h-full bg-bg-base text-text-primary">
        <Outlet/>
    </div>
);

export default StandaloneWindow;
