import React from 'react';
import {useConfig} from '../context/ConfigContext';

const MainWindow: React.FC = () => {
    const {config} = useConfig();

    return (
        <div className="flex h-full flex-col items-center justify-center gap-6 bg-bg-base text-center text-text-primary">
            <div className="max-w-md space-y-3">
                <p className="text-sm uppercase tracking-[0.3em] text-text-tertiary">Winky</p>
                <h1 className="text-3xl font-semibold">Готова помочь</h1>
                <p className="text-sm text-text-secondary">
                    Используйте боковое меню, чтобы открыть разделы <span className="font-medium">Me</span>,{' '}
                    <span className="font-medium">Actions</span> или <span className="font-medium">Settings</span>. Здесь
                    будет ваш рабочий стол, когда вы закончите настройку.
                </p>
            </div>
            {!config?.setupCompleted && (
                <div className="rounded-xl border border-border/60 bg-white/5 px-6 py-3 text-sm text-text-secondary">
                    Завершите onboarding, чтобы активировать голосовой интерфейс и быстрые действия.
                </div>
            )}
        </div>
    );
};

export default MainWindow;
