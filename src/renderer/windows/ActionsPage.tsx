import React, {useMemo} from 'react';
import {useConfig} from '../context/ConfigContext';
import {useIcons} from '../context/IconsContext';
import {useToast} from '../context/ToastContext';
import ActionToolbar from '../features/actions/components/ActionToolbar';
import ActionEmptyState from '../features/actions/components/ActionEmptyState';
import ActionList from '../features/actions/components/ActionList';
import ActionForm from '../features/actions/components/ActionForm';
import {useActionForm} from '../features/actions/hooks/useActionForm';

const ActionsPage: React.FC = () => {
    const {config, refreshConfig} = useConfig();
    const {icons, loading: iconsLoading, fetchIcons} = useIcons();
    const {showToast} = useToast();

    const actions = useMemo(() => config?.actions ?? [], [config?.actions]);
    const hasToken = config?.auth.access || config?.auth.accessToken;
    const isAuthorized = Boolean(hasToken);

    const form = useActionForm({
        icons,
        iconsLoading,
        fetchIcons,
        isAuthorized,
        showToast,
        refreshConfig
    });

    if (!isAuthorized) {
        return (
            <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center gap-4 text-center text-text-secondary">
                <p className="text-2xl font-semibold text-text-primary">Sign in to manage actions</p>
                <p className="text-sm">Авторизуйтесь, чтобы настраивать быстрые сценарии и горячие клавиши.</p>
            </div>
        );
    }

    return (
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 px-8 py-6">
            <ActionToolbar actionsCount={actions.length} onCreate={form.openCreateModal}/>
            {actions.length === 0 ? (
                <ActionEmptyState onCreate={form.openCreateModal}/>
            ) : (
                <ActionList
                    actions={actions}
                    deletingIds={form.deletingIds}
                    onEdit={form.openEditModal}
                    onDelete={form.handleDelete}
                />
            )}
            <ActionForm
                icons={icons}
                iconsLoading={iconsLoading}
                values={form.values}
                setField={form.setField}
                modal={form.modal}
                saving={form.saving}
                editingActionId={form.editingActionId}
                onSubmit={form.handleSubmit}
            />
        </div>
    );
};

export default ActionsPage;
