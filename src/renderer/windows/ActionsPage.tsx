import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle} from '@mui/material';
import {useConfig} from '../context/ConfigContext';
import {useIcons} from '../context/IconsContext';
import {useToast} from '../context/ToastContext';
import ActionToolbar from '../features/actions/components/ActionToolbar';
import ActionEmptyState from '../features/actions/components/ActionEmptyState';
import ActionForm from '../features/actions/components/ActionForm';
import GroupCard from '../features/actions/components/GroupCard';
import GroupForm from '../features/actions/components/GroupForm';
import {useActionForm} from '../features/actions/hooks/useActionForm';
import {useGroupForm} from '../features/actions/hooks/useGroupForm';
import {groupsBridge} from '../services/winkyBridge';
import {SYSTEM_GROUP_ID} from '@shared/constants';

const ActionsPage: React.FC = () => {
    const {config, refreshConfig} = useConfig();
    const {icons, loading: iconsLoading, fetchIcons} = useIcons();
    const {showToast} = useToast();
    const groupsFetchedRef = useRef(false);
    const [showPrompts, setShowPrompts] = useState(false);

    const allGroups = useMemo(() => config?.groups ?? [], [config?.groups]);
    const systemGroup = useMemo(() => allGroups.find((g) => g.is_system || g.id === SYSTEM_GROUP_ID), [allGroups]);
    const userGroups = useMemo(() => allGroups.filter((g) => !g.is_system && g.id !== SYSTEM_GROUP_ID), [allGroups]);
    const actions = useMemo(() => config?.actions ?? [], [config?.actions]);
    const hasToken = config?.auth.access || config?.auth.accessToken;
    const isAuthorized = Boolean(hasToken);

    // Загружаем группы с экшенами при монтировании, если авторизованы
    useEffect(() => {
        if (!isAuthorized || groupsFetchedRef.current) return;
        groupsFetchedRef.current = true;

        groupsBridge.fetch()
            .then(() => refreshConfig())
            .catch((error) => {
                console.warn('[ActionsPage] Failed to fetch groups:', error);
            });
    }, [isAuthorized, refreshConfig]);

    const actionForm = useActionForm({
        icons,
        iconsLoading,
        fetchIcons,
        groups: userGroups,
        isAuthorized,
        showToast,
        refreshConfig
    });

    const groupForm = useGroupForm({
        icons,
        iconsLoading,
        fetchIcons,
        isAuthorized,
        showToast,
        refreshConfig
    });

    const handleCreateAction = isAuthorized ? actionForm.openCreateModal : () => {
        showToast('Please sign in to manage actions.', 'error');
    };

    const handleCreateGroup = isAuthorized ? groupForm.openCreateModal : () => {
        showToast('Please sign in to manage groups.', 'error');
    };

    const handleClone = () => {
        if (!actionForm.editingActionId) return;
        const actionToClone = actions.find((a) => a.id === actionForm.editingActionId);
        if (!actionToClone) return;
        actionForm.openCloneModal(actionToClone);
    };

    const content = !isAuthorized ? (
        <ActionEmptyState
            title="Sign in to manage actions"
            description="Sign in to configure quick scenarios and keyboard shortcuts."
            ctaLabel="Open sign in"
            onCta={handleCreateAction}
        />
    ) : userGroups.length === 0 && !systemGroup ? (
        <ActionEmptyState
            title="No groups yet"
            description="Create a group to organize your actions."
            ctaLabel="Create group"
            onCta={handleCreateGroup}
        />
    ) : (
        <div className="fc gap-4 w-full">
            {/* User groups first */}
            {userGroups.map((group) => (
                <GroupCard
                    key={group.id}
                    group={group}
                    deletingActionIds={actionForm.deletingIds}
                    isDeleting={groupForm.deletingIds.has(group.id)}
                    onEditGroup={groupForm.openEditModal}
                    onDeleteGroup={groupForm.handleDelete}
                    onEditAction={actionForm.openEditModal}
                    onDeleteAction={actionForm.handleDelete}
                    showPrompts={showPrompts}
                />
            ))}
            {/* System group at the bottom */}
            {systemGroup && systemGroup.actions.length > 0 && (
                <GroupCard
                    key={systemGroup.id}
                    group={systemGroup}
                    deletingActionIds={actionForm.deletingIds}
                    isDeleting={false}
                    onEditGroup={() => {}}
                    onDeleteGroup={() => {}}
                    onEditAction={actionForm.openEditModal}
                    onDeleteAction={() => {}}
                    showPrompts={showPrompts}
                />
            )}
        </div>
    );

    return (
        <div className="fr mx-auto w-full flex-col px-8 py-6 overflow-hidden">
            <div className="fc gap-4 w-full">
                <ActionToolbar
                    actionsCount={actions.length}
                    groupsCount={userGroups.length}
                    showPrompts={showPrompts}
                    onToggleShowPrompts={setShowPrompts}
                    onCreateAction={handleCreateAction}
                    onCreateGroup={handleCreateGroup}
                />
                {content}
            </div>

            <ActionForm
                icons={icons}
                iconsLoading={iconsLoading}
                groups={userGroups}
                values={actionForm.values}
                setField={actionForm.setField}
                modal={actionForm.modal}
                mode={actionForm.mode}
                saving={actionForm.saving}
                editingActionId={actionForm.editingActionId}
                editingActionIsDefault={actionForm.editingActionIsDefault}
                onSubmit={actionForm.handleSubmit}
                onClone={handleClone}
            />

            <GroupForm
                icons={icons}
                iconsLoading={iconsLoading}
                values={groupForm.values}
                setField={groupForm.setField}
                modal={groupForm.modal}
                mode={groupForm.mode}
                saving={groupForm.saving}
                onSubmit={groupForm.handleSubmit}
            />

            {/* Delete action dialog */}
            <Dialog open={Boolean(actionForm.pendingDelete)} onClose={actionForm.cancelDelete} maxWidth="xs" fullWidth>
                <DialogTitle>Delete action?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {actionForm.pendingDelete
                            ? `Do you really want to delete "${actionForm.pendingDelete.name}"? This cannot be undone.`
                            : ''}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={actionForm.cancelDelete} color="inherit">
                        Cancel
                    </Button>
                    <Button onClick={actionForm.confirmDelete} color="error" variant="contained">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete group dialog */}
            <Dialog open={Boolean(groupForm.pendingDelete)} onClose={groupForm.cancelDelete} maxWidth="xs" fullWidth>
                <DialogTitle>Delete group?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {groupForm.pendingDelete
                            ? `Do you really want to delete "${groupForm.pendingDelete.name}"? Actions in this group will be removed from it.`
                            : ''}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={groupForm.cancelDelete} color="inherit">
                        Cancel
                    </Button>
                    <Button onClick={groupForm.confirmDelete} color="error" variant="contained">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default ActionsPage;
