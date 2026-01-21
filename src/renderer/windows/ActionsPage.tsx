import React, {useMemo} from 'react';
import {Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle} from '@mui/material';
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

    const handleCreateAction = isAuthorized ? form.openCreateModal : () => {
        showToast('Please sign in to manage actions.', 'error');
    };

    const handleClone = () => {
        if (!form.editingActionId) return;
        const actionToClone = actions.find((a) => a.id === form.editingActionId);
        if (!actionToClone) return;
        form.openCloneModal(actionToClone);
    };

    const content = !isAuthorized ? (
        <ActionEmptyState
            title="Sign in to manage actions"
            description="Sign in to configure quick scenarios and keyboard shortcuts."
            ctaLabel="Open sign in"
            onCta={handleCreateAction}
        />
    ) : actions.length === 0 ? (
        <ActionEmptyState
            title="No actions yet"
            description="Click the button below to create your first action."
            ctaLabel="Create action"
            onCta={handleCreateAction}
        />
    ) : (
        <ActionList
            actions={actions}
            deletingIds={form.deletingIds}
            onEdit={form.openEditModal}
            onDelete={form.handleDelete}
        />
    );

    return (
        <div className="fr mx-auto w-full max-w-5xl flex-col px-8 py-6 overflow-hidden">
            <div className="fc gap-4">
                <ActionToolbar actionsCount={actions.length} onCreate={handleCreateAction}/>
                {content}
            </div>
            <ActionForm
                icons={icons}
                iconsLoading={iconsLoading}
                values={form.values}
                setField={form.setField}
                modal={form.modal}
                mode={form.mode}
                saving={form.saving}
                editingActionId={form.editingActionId}
                editingActionIsDefault={form.editingActionIsDefault}
                onSubmit={form.handleSubmit}
                onClone={handleClone}
            />
            <Dialog open={Boolean(form.pendingDelete)} onClose={form.cancelDelete} maxWidth="xs" fullWidth>
                <DialogTitle>Delete action?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {form.pendingDelete
                            ? `Do you really want to delete "${form.pendingDelete.name}"? This cannot be undone.`
                            : ''}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={form.cancelDelete} color="inherit">
                        Cancel
                    </Button>
                    <Button onClick={form.confirmDelete} color="error" variant="contained">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default ActionsPage;
