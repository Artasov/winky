import React from 'react';
import classNames from 'classnames';
import type { ActionConfig } from '@shared/types';

interface ActionButtonProps {
  action: ActionConfig;
  onClick: (action: ActionConfig) => void;
  disabled?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({ action, onClick, disabled }) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(action)}
      className={classNames(
        'flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-300',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span className="text-2xl" aria-hidden="true">
        {action.icon || '⭐'}
      </span>
      <span className="truncate px-2 text-center text-xs uppercase tracking-wide">
        {action.name}
      </span>
    </button>
  );
};

export default ActionButton;
