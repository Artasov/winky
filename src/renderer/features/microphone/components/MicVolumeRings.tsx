import React from 'react';

interface MicVolumeRingsProps {
    isRecording: boolean;
    normalizedVolume: number;
}

const ringMultipliers = [4, 3, 2, 1];

const MicVolumeRingsComponent: React.FC<MicVolumeRingsProps> = ({isRecording, normalizedVolume}) => (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{overflow: 'visible'}}>
        {ringMultipliers.map((multiplier) => (
            <div
                key={multiplier}
                className="absolute rounded-full border-[3px]"
                style={{
                    width: `${60 + multiplier * 20}px`,
                    height: `${60 + multiplier * 20}px`,
                    borderColor: isRecording
                        ? `rgba(239, 68, 68, ${0.7 - multiplier * 0.1})`
                        : 'rgba(16, 185, 129, 0.5)',
                    opacity: isRecording
                        ? Math.max(0, normalizedVolume - (multiplier - 1) * 0.15)
                        : 0,
                    transform: `scale(${isRecording ? 1 + normalizedVolume * 0.4 : 0.8})`,
                    boxShadow: isRecording
                        ? `0 0 ${15 + normalizedVolume * 30}px ${5 + normalizedVolume * 15}px rgba(239, 68, 68, ${0.5 + normalizedVolume * 0.3})`
                        : 'none',
                    transition: 'opacity 0.12s ease, transform 0.12s ease'
                }}
            />
        ))}
    </div>
);

const MicVolumeRings = React.memo(MicVolumeRingsComponent);

export default MicVolumeRings;
