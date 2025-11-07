import React from 'react';

type ActionToolbarProps = {
    actionsCount: number;
    onCreate: () => void;
};

const ActionToolbar: React.FC<ActionToolbarProps> = ({actionsCount, onCreate}) => (
    <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold text-text-primary">Actions</h1>
            <p className="text-sm text-text-secondary">
                Manage quick scenarios for your voice assistant.
            </p>
        </div>
        <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-bg-base shadow-primary hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
            <span className="text-lg">+</span>
            Create action ({actionsCount})
        </button>
    </div>
);

export default ActionToolbar;
