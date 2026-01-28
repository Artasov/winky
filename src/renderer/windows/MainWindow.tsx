import React from 'react';
import {useConfig} from '../context/ConfigContext';

const MainWindow: React.FC = () => {
    const {config} = useConfig();

    return (
        <div className="flex h-full flex-col items-center justify-center gap-6 bg-bg-base text-center text-text-primary">
            <div className="max-w-md space-y-3">
                <p className="text-sm uppercase tracking-[0.3em] text-text-tertiary">Winky</p>
                <h1 className="text-3xl font-semibold">Ready to help</h1>
                <p className="text-sm text-text-secondary">
                    Use the sidebar to open <span className="font-medium">Me</span>,{' '}
                    <span className="font-medium">Actions</span>, or <span className="font-medium">Settings</span>. This
                    will become your workspace once setup is complete.
                </p>
            </div>
            {!config?.setupCompleted && (
                <div className="rounded-xl border border-border/60 bg-bg-elevated/60 px-6 py-3 text-sm text-text-secondary">
                    Finish onboarding to activate the voice interface and quick actions.
                </div>
            )}
        </div>
    );
};

export default MainWindow;

