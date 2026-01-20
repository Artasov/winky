import React from 'react';

const WAVE_MIN_HEIGHT = 3;
const WAVE_MAX_HEIGHT = 20;

type RecordedWaveformProps = {
    waveform: number[];
};

const RecordedWaveform: React.FC<RecordedWaveformProps> = ({waveform}) => {
    const bars = waveform.length > 0 ? waveform : new Array(48).fill(0.35);

    return (
        <div className="w-full px-2">
            <div
                className="grid w-full items-end gap-1"
                style={{gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`}}
            >
                {bars.map((value, index) => {
                    const height = Math.max(WAVE_MIN_HEIGHT, Math.round(value * WAVE_MAX_HEIGHT));
                    return (
                        <span
                            key={`wave-${index}`}
                            className="block w-full max-w-[6px] justify-self-center rounded-full bg-primary-600/70"
                            style={{height: `${height}px`}}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default RecordedWaveform;
