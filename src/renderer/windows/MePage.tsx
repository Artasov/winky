import React from 'react';
import {useUser} from '../context/UserContext';
import {useConfig} from '../context/ConfigContext';
import {useToast} from '../context/ToastContext';

const MePage: React.FC = () => {
    const {user, loading, clearUser} = useUser();
    const {config} = useConfig();
    const {showToast} = useToast();
    const isAuthorized = Boolean(config?.auth.accessToken);

    const handleLogout = async () => {
        if (!window.winky?.auth?.logout) {
            console.error('[MePage] Logout API is unavailable');
            showToast('Logout is not available in this environment.', 'error');
            return;
        }

        try {
            await window.winky.auth.logout();
            clearUser();
            showToast('Logged out successfully.', 'success');
        } catch (error) {
            console.error('[MePage] Failed to logout', error);
            showToast('Failed to logout.', 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="animate-pulse-soft text-primary">Loading profile...</div>
            </div>
        );
    }

    return (
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 px-8 py-6">
            <div className="frbc gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-semibold text-text-primary">My Profile</h1>
                    <p className="text-sm text-text-secondary">Information about the currently connected account.</p>
                </div>
                {isAuthorized && (
                    <button
                        onClick={handleLogout}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary shadow-primary-sm transition-[background-color,border-color,color] duration-base hover:border-primary hover:bg-primary-100 hover:text-primary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                        title="Logout"
                    >
                        <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                        </svg>
                    </button>
                )}
            </div>

            {!isAuthorized ? (
                <div
                    className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-primary-200 bg-bg-secondary px-6 py-16 text-center">
                    <div className="text-4xl opacity-60">👤</div>
                    <p className="text-sm text-text-secondary">Please sign in to view profile data.</p>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    <section
                        className="card-animated rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
                        <h2 className="mb-4 text-lg font-semibold text-text-primary">Authorization Status</h2>
                        <div className="flex items-center gap-3 text-sm text-text-primary">
                            <span
                                className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full bg-primary animate-pulse-soft"
                                aria-hidden="true"/>
                            <span>Authorized</span>
                        </div>
                    </section>

                    {user && (
                        <section
                            className="card-animated rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
                            <h2 className="mb-4 text-lg font-semibold text-text-primary">User Information</h2>
                            <div className="flex flex-col gap-2 text-sm text-text-primary">
                                <div className="flex items-center justify-between">
                                    <span className="text-text-secondary">Email:</span>
                                    <span className="font-medium">{user.email}</span>
                                </div>
                                {user.username && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-text-secondary">Username:</span>
                                        <span className="font-medium">{user.username}</span>
                                    </div>
                                )}
                                {(user.first_name || user.last_name) && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-text-secondary">Name:</span>
                                        <span
                                            className="font-medium">{`${user.first_name || ''} ${user.last_name || ''}`.trim()}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
                                    <span className="text-text-secondary">User ID:</span>
                                    <span className="font-mono text-xs">{user.id}</span>
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
};

export default MePage;
