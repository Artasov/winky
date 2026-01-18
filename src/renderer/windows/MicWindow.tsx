import React, {useRef} from 'react';
import MicOverlay from '../features/microphone/components/MicOverlay';

const MicWindow: React.FC = () => {
    return (
        <div className="h-full w-full bg-transparent" style={{overflow: 'visible'}}>
            <MicOverlay/>
        </div>
    );
};

export default MicWindow;
