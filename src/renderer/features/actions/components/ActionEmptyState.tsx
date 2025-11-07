import React from 'react';

type Props = {
    onCreate: () => void;
};

const ActionEmptyState: React.FC<Props> = ({onCreate}) => (
    <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-white/5 p-10 text-center text-text-secondary">
        <p className="text-lg font-semibold text-text-primary">No actions yet</p>
        <p className="mt-2 text-sm">Create your first workflow to trigger it by voice or hotkey.</p>
        <button
            type="button"
            onClick={onCreate}
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow focus:outline-none focus:ring-2 focus:ring-primary/70"
        >
            Create action
        </button>
    </div>
);

export default ActionEmptyState;
