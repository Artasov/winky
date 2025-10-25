import React from 'react';
import classNames from 'classnames';

interface MicrophoneButtonProps {
  isRecording: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: 'default' | 'compact';
}

const sizeClasses: Record<NonNullable<MicrophoneButtonProps['size']>, string> = {
  default: 'h-24 w-24',
  compact: 'h-16 w-16'
};

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({ isRecording, onToggle, disabled, size = 'default' }) => {
  const handleClick = () => {
    if (!disabled) {
      onToggle();
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={classNames(
        'app-region-no-drag',
        'flex items-center justify-center rounded-full text-3xl shadow-xl transition-transform focus:outline-none focus:ring-2 focus:ring-offset-2',
        sizeClasses[size],
        isRecording
          ? 'bg-rose-600 text-white hover:bg-rose-500 focus:ring-rose-300'
          : 'bg-emerald-600 text-white hover:bg-emerald-500 focus:ring-emerald-300',
        disabled && 'opacity-60',
        isRecording ? 'scale-95' : 'scale-100',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      )}
    >
      {isRecording ? (
        <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current">
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
          <path d="M19 12a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V21h-3a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.07A7 7 0 0 0 19 12z" />
        </svg>
      )}
    </button>
  );
};

export default MicrophoneButton;
