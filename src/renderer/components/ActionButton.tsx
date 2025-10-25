import React from 'react';
import classNames from 'classnames';
import type { ActionConfig } from '@shared/types';

interface ActionButtonProps {
  action: ActionConfig;
  onClick: (action: ActionConfig) => void;
  disabled?: boolean;
  isActive?: boolean;
  variant?: 'default' | 'floating';
}

const ActionButton: React.FC<ActionButtonProps> = ({ action, onClick, disabled, isActive, variant = 'default' }) => {
  const baseClasses =
    variant === 'floating'
      ? 'pointer-events-auto flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-full border border-white/20 bg-white/10 text-[9px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/20'
      : 'pointer-events-auto flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white transition hover:bg-white/10';
  const iconClass = variant === 'floating' ? 'text-base' : 'text-2xl';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(action)}
      data-interactive="true"
      className={classNames(
        'app-region-no-drag',
        baseClasses,
        'focus:outline-none focus:ring-2 focus:ring-emerald-300',
        disabled && 'cursor-not-allowed opacity-50',
        isActive && 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
      )}
      title={action.name}
    >
      <span className={iconClass} aria-hidden="true">
        {action.icon || '⭐'}
      </span>
      {variant === 'floating' ? (
        <span className="sr-only">{action.name}</span>
      ) : (
        <span className="truncate px-2 text-center text-xs uppercase tracking-wide">{action.name}</span>
      )}
    </button>
  );
};

export default ActionButton;
