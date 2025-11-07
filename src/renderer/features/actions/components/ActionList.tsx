import React from 'react';
import type {ActionConfig} from '@shared/types';

type Props = {
    actions: ActionConfig[];
    deletingIds: Set<string>;
    onEdit: (action: ActionConfig) => void;
    onDelete: (actionId: string, actionName: string) => void;
};

const ActionList: React.FC<Props> = ({actions, deletingIds, onEdit, onDelete}) => (
    <div className="grid gap-4 sm:grid-cols-2">
        {actions.map((action) => {
            const isDeleting = deletingIds.has(action.id);
            const handleDeleteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onDelete(action.id, action.name);
            };
            return (
                <div
                    key={action.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onEdit(action)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onEdit(action);
                        }
                    }}
                    className="card-animated group relative flex flex-col gap-3 rounded-2xl border border-primary-200 bg-white p-3 shadow-primary-sm transition-all duration-base hover:border-primary hover:shadow-primary-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                >
                    <div className="absolute right-3 top-3 flex gap-2 opacity-0 transition-opacity duration-base group-hover:opacity-100">
                        <button
                            type="button"
                            onClick={handleDeleteClick}
                            disabled={isDeleting}
                            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary-50 text-primary transition-[background-color,border-color] duration-base hover:border-primary-dark hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                            aria-label="Delete action"
                        >
                            {isDeleting ? (
                                <span className="text-xs">…</span>
                            ) : (
                                <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                                    <path
                                        fillRule="evenodd"
                                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            )}
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {action.icon_details?.svg ? (
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-secondary">
                                <img
                                    src={action.icon_details.svg}
                                    alt={action.icon_details.name || ''}
                                    className="h-8 w-8"
                                />
                            </div>
                        ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-secondary text-2xl">
                                ⚡
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <h3 className="truncate text-base font-semibold text-text-primary">{action.name}</h3>
                            <p className="text-xs text-text-tertiary">{action.icon_details?.name || 'No icon'}</p>
                            {action.hotkey && (
                                <p className="text-xs text-text-tertiary">Hotkey: {action.hotkey}</p>
                            )}
                        </div>
                    </div>

                    <p className="rounded-xl bg-bg-secondary/80 p-3 text-sm text-text-secondary">
                        {action.prompt && action.prompt.trim().length > 0
                            ? action.prompt
                            : 'Речь будет дословно преобразована в текст и отправлена без дополнительной LLM‑обработки.'}
                    </p>

                    <div className="flex flex-wrap gap-2 text-xs text-text-tertiary">
                        {action.show_results && (
                            <span className="rounded-lg bg-primary/10 px-2 py-1 text-primary">Result window</span>
                        )}
                        {action.sound_on_complete && (
                            <span className="rounded-lg bg-rose-100/70 px-2 py-1 text-rose-600">Sound</span>
                        )}
                        {action.auto_copy_result && (
                            <span className="rounded-lg bg-emerald-100 px-2 py-1 text-emerald-600">Clipboard</span>
                        )}
                    </div>
                </div>
            );
        })}
    </div>
);

export default ActionList;
