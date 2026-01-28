import React from 'react';
import classNames from 'classnames';
import {interactiveEnter, interactiveLeave} from '../utils/interactive';

interface MicrophoneButtonProps {
    isRecording: boolean;
    onToggle: () => void;
    disabled?: boolean;
    size?: 'default' | 'compact';
}

const sizeClasses: Record<NonNullable<MicrophoneButtonProps['size']>, string> = {
    default: 'h-20 w-20',
    compact: 'h-14 w-14'
};

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({isRecording, onToggle, disabled, size = 'default'}) => {
    const handleMouseEnter = () => {
        interactiveEnter();
    };

    const handleMouseLeave = () => {
        interactiveLeave();
    };

    return (
        <button
            type="button"
            disabled={disabled}
            data-mic-button="true"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={disabled ? undefined : onToggle}
            className={classNames(
                'pointer-events-auto relative z-10 touch-none select-none app-region-no-drag',
                'flex items-center justify-center rounded-full text-3xl shadow-xl outline-none',
                sizeClasses[size],
                isRecording
                    ? 'bg-rose-600 text-white hover:bg-rose-500'
                    : 'bg-bg-base text-text-primary',
                disabled && 'opacity-60',
                disabled && 'cursor-not-allowed'
            )}
            style={{
                transform: isRecording ? 'scale(0.7)' : 'scale(1)',
                transition: 'transform 0.3s ease-in-out, background-color 0.3s ease-in-out'
            }}
        >
            {/* Иконка микрофона */}
            <svg
                viewBox="0 0 24 24"
                className={classNames(
                    'absolute h-10 w-10 fill-current pointer-events-none text-text-primary transition-opacity duration-300',
                    isRecording ? 'opacity-0' : 'opacity-100'
                )}
            >
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/>
                <path
                    d="M19 12a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V21h-3a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.07A7 7 0 0 0 19 12z"/>
            </svg>

            {/* Иконка квадратика (стоп) */}
            <svg
                viewBox="0 0 24 24"
                className={classNames(
                    'absolute h-10 w-10 fill-current pointer-events-none transition-opacity duration-300',
                    isRecording ? 'opacity-100' : 'opacity-0'
                )}
            >
                <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
        </button>
    );
};

export default MicrophoneButton;
