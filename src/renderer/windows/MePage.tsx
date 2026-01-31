import React from 'react';
import {alpha, useTheme} from '@mui/material/styles';
import {Button} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {useUser} from '../context/UserContext';
import {useConfig} from '../context/ConfigContext';
import {useToast} from '../context/ToastContext';
import {useAuth} from '../auth';
import {SITE_BASE_URL} from '@shared/constants';

const MePage: React.FC = () => {
    const {user, loading, clearUser} = useUser();
    const {config} = useConfig();
    const {showToast} = useToast();
    const auth = useAuth();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const neutralBorder = alpha('#6f6f6f', 0.22);
    const hasToken = config?.auth.access || config?.auth.accessToken;
    const isAuthorized = Boolean(hasToken);

    const winkyToken = Array.isArray(user?.tiers_and_features)
        ? user?.tiers_and_features.find((item: any) => item?.token_ticker === 'WINKY') ??
        user?.tiers_and_features[0]
        : null;
    const tierLabel =
        (winkyToken?.active_tier?.name as string) ||
        (winkyToken?.active_tier?.slug as string) ||
        (user?.winky_tier as string) ||
        (user?.active_tier as string) ||
        (user?.tier as string) ||
        'Not available';
    const balanceRaw =
        (winkyToken?.balance as any) ??
        (user?.winky_balance as any) ??
        (user?.token_balance as any) ??
        (user?.balance as any);
    const balance =
        typeof balanceRaw === 'number'
            ? balanceRaw.toLocaleString(undefined, {maximumFractionDigits: 2})
            : typeof balanceRaw === 'string'
                ? balanceRaw
                : '-';

    const featureSchema: Array<{ code: string; label?: string; kind?: string }> =
        Array.isArray(winkyToken?.feature_schema) ? winkyToken?.feature_schema : [];
    const activeFeatures: Record<string, any> = winkyToken?.active_features || {};
    const parsedFeatures =
        featureSchema.length > 0
            ? featureSchema.map((item) => {
                const value = activeFeatures[item.code];
                const label = item.label || item.code;
                const formatted =
                    typeof value === 'boolean'
                        ? value ? 'Enabled' : 'Disabled'
                        : value ?? '-';
                return {label, value: formatted};
            })
            : Object.keys(activeFeatures).map((code) => ({
                label: code,
                value:
                    typeof activeFeatures[code] === 'boolean'
                        ? activeFeatures[code] ? 'Enabled' : 'Disabled'
                        : activeFeatures[code]
            }));

    const handleLogout = async () => {
        try {
            await auth.signOut();
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
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 px-8 py-6">
            <div className="frbc gap-4">
                <div className="frcc gap-3">
                    <div className="fcc h-12 w-12 rounded-full bg-primary text-white text-lg font-semibold overflow-hidden">
                        {user?.avatar ? (
                            <img
                                src={user.avatar}
                                alt="Avatar"
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <span>{user?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}</span>
                        )}
                    </div>
                    <div className="fc gap-0.5">
                        <h1 className="text-xl font-semibold text-text-primary">
                            {user?.username || user?.email?.split('@')[0] || 'User'}
                        </h1>
                        {user?.email && (
                            <p className="text-sm text-text-secondary">{user.email}</p>
                        )}
                    </div>
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
                <div className="fc gap-4">
                    <section
                        className="card-animated rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 via-bg-elevated to-primary-100 shadow-primary-sm p-6"
                        style={isDark ? {
                            borderColor: neutralBorder,
                            backgroundColor: theme.palette.background.default,
                            backgroundImage: 'none',
                            boxShadow: 'none'
                        } : undefined}
                    >
                        <div className="mb-3 flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xs uppercase tracking-[0.24em] text-primary-700">WINKY access</p>
                                <h2 className="text-xl font-semibold text-text-primary">Features & balance</h2>
                            </div>
                            <div
                                className="rounded-full bg-primary-200 px-3 py-1 text-xs font-semibold text-primary-800 shadow-primary-sm"
                                style={isDark ? {
                                    backgroundColor: theme.palette.background.default,
                                    border: `1px solid ${neutralBorder}`,
                                    color: theme.palette.text.primary,
                                    boxShadow: 'none'
                                } : undefined}
                            >
                                Tier: {tierLabel || '-'}
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div
                                className="rounded-xl border border-primary-200/60 bg-bg-elevated p-4 shadow-primary-sm"
                                style={isDark ? {
                                    borderColor: neutralBorder,
                                    backgroundColor: theme.palette.background.default,
                                    boxShadow: 'none'
                                } : undefined}
                            >
                                <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">AI Credits</p>
                                <p className="mt-1 text-2xl font-bold text-primary-900">
                                    {typeof user?.balance_credits === 'number'
                                        ? user.balance_credits.toLocaleString(undefined, {maximumFractionDigits: 0})
                                        : '0'}
                                </p>
                                <div className="frbc mt-2">
                                    <p className="text-xs text-text-secondary">For LLM requests</p>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<AddIcon sx={{fontSize: 16}}/>}
                                        onClick={() => {
                                            window.open(`${SITE_BASE_URL}/profile?tab=general&topup=1`, '_blank');
                                        }}
                                        sx={{
                                            fontSize: 11,
                                            py: 0.25,
                                            px: 1,
                                            minWidth: 0,
                                            borderRadius: 2,
                                        }}
                                    >
                                        Top Up
                                    </Button>
                                </div>
                            </div>
                            <div
                                className="rounded-xl border border-primary-200/60 bg-bg-elevated p-4 shadow-primary-sm"
                                style={isDark ? {
                                    borderColor: neutralBorder,
                                    backgroundColor: theme.palette.background.default,
                                    boxShadow: 'none'
                                } : undefined}
                            >
                                <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">Token Balance</p>
                                <p className="mt-1 text-2xl font-bold text-primary-900">{balance}</p>
                                <p className="text-xs text-text-secondary">WINKY tokens</p>
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 mt-4">
                            <div
                                className="rounded-xl border border-primary-200/60 bg-bg-elevated p-4 shadow-primary-sm"
                                style={isDark ? {
                                    borderColor: neutralBorder,
                                    backgroundColor: theme.palette.background.default,
                                    boxShadow: 'none'
                                } : undefined}
                            >
                                <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">Tier</p>
                                <p className="mt-1 text-lg font-semibold text-text-primary">{tierLabel}</p>
                                <p className="text-xs text-text-secondary">Access level for premium features.</p>
                            </div>
                        </div>
                        <div className="mt-4">
                            <p className="text-sm font-semibold text-text-primary mb-2">Available features</p>
                            {parsedFeatures.length === 0 ? (
                                <p className="text-sm text-text-secondary">No feature info available.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {parsedFeatures.map((feature) => (
                                        <span
                                            key={feature.label}
                                            className="rounded-full border border-primary-200 bg-bg-elevated px-3 py-1 text-xs font-medium text-text-primary shadow-primary-sm"
                                            title={feature.label}
                                            style={isDark ? {
                                                borderColor: neutralBorder,
                                                backgroundColor: theme.palette.background.default,
                                                boxShadow: 'none'
                                            } : undefined}
                                        >
                                            {feature.label}: {String(feature.value)}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};

export default MePage;

