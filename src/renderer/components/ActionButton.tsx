import React from 'react';
import classNames from 'classnames';
import type {ActionConfig} from '@shared/types';
import {interactiveEnter, interactiveLeave} from '../utils/interactive';
import GlassTooltip from './GlassTooltip';

interface ActionButtonProps {
    action: ActionConfig;
    onClick: (action: ActionConfig) => void;
    disabled?: boolean;
    isActive?: boolean;
    isLoading?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({
                                                       action,
                                                       onClick,
                                                       disabled,
                                                       isActive,
                                                       isLoading
                                                   }) => {
    const baseClasses = 'frcc pointer-events-auto h-7 w-7 rounded-full border border-black/20 bg-[#000000cc] transition duration-300 hover:border-white/10 hover:bg-[#000] hover:scale-120'
    const iconClass = 'text-xs';
    const iconSize = 15;

    return (
        <GlassTooltip content={action.name}>
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
                    disabled && 'cursor-not-allowed opacity-50',
                    isActive && '...'
                )}
            >
            {isLoading ? (
                <svg
                    className={classNames(
                        'animate-spin',
                        'h-3 w-3'
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
                            className={'filter brightness-0 invert transition'}
                        />
                    ) : (
                        <span className={classNames(iconClass, 'text-white')}
                              aria-hidden="true">⭐</span>
                    )}
                </>
            )}
                <span className="sr-only">{action.name}</span>
            </button>
        </GlassTooltip>
    );
};

export default ActionButton;
