import React from 'react';
import MicOverlay from '../features/microphone/components/MicOverlay';

const MicWindow: React.FC = () => (
    <div className="h-full w-full bg-transparent" style={{overflow: 'visible'}}>
        <MicOverlay/>
    </div>
);

export default MicWindow;
