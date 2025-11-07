import React from 'react';
import HotkeyInput from '../../../components/HotkeyInput';
import type {ActionFormValues} from '../hooks/useActionForm';

type ModalProps = {
    isModalVisible: boolean;
    isModalClosing: boolean;
    beginModalClose: () => void;
    handleOverlayMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
};

type Props = {
    icons: Array<{ id: string; name: string; emoji?: string; svg?: string }>;
    iconsLoading: boolean;
    values: ActionFormValues;
    setField: <K extends keyof ActionFormValues>(key: K, value: ActionFormValues[K]) => void;
    modal: ModalProps;
    saving: boolean;
    editingActionId: string | null;
    onSubmit: (event: React.FormEvent) => Promise<void>;
};

const ActionForm: React.FC<Props> = ({
    icons,
    iconsLoading,
    values,
    setField,
    modal,
    saving,
    editingActionId,
    onSubmit
}) => {
    if (!modal.isModalVisible) {
        return null;
    }

    const selectedIconName = icons.find((icon) => icon.id === values.iconId)?.name;

    return (
        <div
            className={`fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6 py-10 ${
                modal.isModalClosing ? 'animate-modal-out' : 'animate-modal-in'
            }`}
            onMouseDown={modal.handleOverlayMouseDown}
            role="presentation"
        >
            <form
                onSubmit={onSubmit}
                className={`flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-primary-200 bg-white shadow-primary-xl ${
                    modal.isModalClosing ? 'animate-modal-out' : 'animate-modal-in'
                }`}
            >
                <div className="flex items-start justify-between gap-3 px-6 py-4">
                    <div>
                        <h2 className="text-xl font-semibold text-text-primary">
                            {editingActionId ? 'Edit Action' : 'New Action'}
                        </h2>
                        <p className="text-sm text-text-secondary">Specify the name, prompt, hotkey and icon.</p>
                    </div>
                    <button
                        type="button"
                        onClick={modal.beginModalClose}
                        className="frcc h-9 w-9 rounded-lg border border-primary-200 text-text-secondary transition hover:border-primary hover:text-primary"
                        aria-label="Close form"
                    >
                        <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                            <path
                                d="M1.08.02l.094.083L6 4.915 10.826.105a.5.5 0 01.696.717L6.717 5.636l4.705 4.47a.5.5 0 01-.638.77L6 6.374l-4.784 4.5a.5.5 0 01-.696-.717L5.248 5.636.388.8a.5.5 0 01.692-.779z"
                            />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    <div className="rounded-2xl border border-primary-200 bg-bg-secondary/40 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Action name</p>
                        <input
                            className="mt-2 w-full rounded-xl border border-transparent bg-white/70 px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                            value={values.name}
                            onChange={(event) => setField('name', event.target.value)}
                            placeholder="Send daily standup"
                        />
                    </div>

                    <div className="rounded-2xl border border-primary-200 bg-bg-secondary/40 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Prompt</p>
                        <textarea
                            className="mt-2 w-full rounded-xl border border-transparent bg-white/70 px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                            value={values.prompt}
                            onChange={(event) => setField('prompt', event.target.value)}
                            placeholder="Summarize last 5 Jira updates..."
                            rows={3}
                        />
                    </div>

                    <div className="rounded-2xl border border-primary-200 bg-bg-secondary/40 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Hotkey</p>
                        <div className="mt-2 rounded-xl border border-transparent bg-white/70 px-3 py-2">
                            <HotkeyInput value={values.hotkey ?? ''} onChange={(next) => setField('hotkey', next)}/>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-primary-200 bg-bg-secondary/40 px-4 py-3 text-sm text-text-primary">
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                            Icon {selectedIconName && <span className="text-text-secondary normal-case">• {selectedIconName}</span>}
                        </p>
                        {iconsLoading ? (
                            <div className="mt-3 rounded-xl border border-primary-200 bg-white/70 px-4 py-6 text-center text-text-secondary">
                                Loading icons...
                            </div>
                        ) : icons.length === 0 ? (
                            <div className="mt-3 rounded-xl border border-primary-200 bg-white/70 px-4 py-6 text-center text-text-secondary">
                                No icons available.
                            </div>
                        ) : (
                            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                                {icons.map((icon) => {
                                    const isSelected = values.iconId === icon.id;
                                    return (
                                        <button
                                            key={icon.id}
                                            type="button"
                                            onClick={() => setField('iconId', icon.id)}
                                            className={`flex h-12 w-full items-center justify-center rounded-xl border-2 p-2 transition duration-200 ${
                                                isSelected
                                                    ? 'border-primary bg-primary-50 shadow-primary-sm'
                                                    : 'border-primary-200 bg-white hover:border-primary hover:bg-primary-50'
                                            }`}
                                            title={icon.name}
                                        >
                                            {icon.emoji ? (
                                                <span className="text-xl">{icon.emoji}</span>
                                            ) : (
                                                <img src={icon.svg} alt={icon.name} className="h-8 w-8"/>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-primary-200 bg-bg-secondary/40 px-4 py-3 text-sm text-text-secondary">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Options</p>
                        <div className="mt-2 flex flex-wrap gap-4">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={values.showResults}
                                    onChange={(event) => setField('showResults', event.target.checked)}
                                />
                                Show result window
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={values.soundOnComplete}
                                    onChange={(event) => setField('soundOnComplete', event.target.checked)}
                                />
                                Play completion sound
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={values.autoCopyResult}
                                    onChange={(event) => setField('autoCopyResult', event.target.checked)}
                                />
                                Copy result to clipboard
                            </label>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4">
                    <button
                        type="button"
                        onClick={modal.beginModalClose}
                        className="rounded-lg border border-primary-200 px-5 py-2 text-sm font-semibold text-text-secondary transition hover:border-primary hover:text-primary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={saving || iconsLoading || icons.length === 0 || !values.iconId}
                        className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white shadow-primary-md transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                    >
                        {saving ? 'Saving…' : editingActionId ? 'Save changes' : 'Create action'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ActionForm;
