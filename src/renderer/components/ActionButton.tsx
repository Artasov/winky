import React from 'react';
import classNames from 'classnames';
import type { ActionConfig } from '@shared/types';
import { interactiveEnter, interactiveLeave } from '../utils/interactive';

interface ActionButtonProps {
  action: ActionConfig;
  onClick: (action: ActionConfig) => void;
  disabled?: boolean;
  isActive?: boolean;
  isLoading?: boolean;
  variant?: 'default' | 'floating';
}

const ActionButton: React.FC<ActionButtonProps> = ({ action, onClick, disabled, isActive, isLoading, variant = 'default' }) => {
  const baseClasses =
    variant === 'floating'
      ? 'pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-slate-950/90 text-white/80 transition hover:border-white/50 hover:text-white hover:bg-slate-900'
      : 'pointer-events-auto flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white transition hover:bg-white/10';
  const iconClass = variant === 'floating' ? 'text-xs' : 'text-2xl';
  const iconSize = variant === 'floating' ? 12 : 32;

  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      onClick={() => onClick(action)}
      onMouseEnter={() => interactiveEnter()}
      onMouseLeave={() => interactiveLeave()}
      onFocus={() => interactiveEnter()}
      onBlur={() => interactiveLeave()}
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
      {isLoading ? (
        <svg 
          className={classNames(
            'animate-spin',
            variant === 'floating' ? 'h-3 w-3' : 'h-6 w-6'
          )}
          viewBox="0 0 24 24"
        >
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
            fill="none"
          />
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <>
          {action.icon_details?.svg ? (
            <img 
              src={action.icon_details.svg}
              alt=""
              width={iconSize}
              height={iconSize}
              aria-hidden="true"
              className={variant === 'floating' ? 'h-3 w-3 filter brightness-0 invert' : undefined}
            />
          ) : (
            <span className={classNames(iconClass, variant === 'floating' ? 'text-white' : undefined)} aria-hidden="true">⭐</span>
          )}
        </>
      )}
      {variant === 'floating' ? (
        <span className="sr-only">{action.name}</span>
      ) : (
        <span className="truncate px-2 text-center text-xs uppercase tracking-wide">{action.name}</span>
      )}
    </button>
  );
};

export default ActionButton;
