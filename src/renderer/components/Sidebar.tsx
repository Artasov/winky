import React from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import classNames from 'classnames';

interface NavItem {
    id: string;
    label: string;
    icon: string;
    path: string;
}

const navItems: NavItem[] = [
    {id: 'me', label: 'Me', icon: '👤', path: '/me'},
    {id: 'actions', label: 'Actions', icon: '⚡', path: '/actions'},
    {id: 'settings', label: 'Settings', icon: '⚙️', path: '/settings'},
    {id: 'info', label: 'Info', icon: 'ℹ️', path: '/info'}
];

const Sidebar: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const handleNavigation = (path: string) => {
        navigate(path);
    };

    return (
        <aside className="flex h-full w-64 flex-col border-r border-primary-200/60 bg-white/95 backdrop-blur shadow-sm">
            <div className="px-6 pb-4 pt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-text-tertiary">Навигация</p>
            </div>

            <nav className="flex flex-1 flex-col gap-1 px-3 pb-6">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => handleNavigation(item.path)}
                            className={classNames(
                                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium duration-base outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light',
                                'transition-[background-color,border-color,box-shadow]',
                                isActive
                                    ? 'active bg-primary-50 text-primary shadow-primary-sm ring-1 ring-primary-200'
                                    : 'text-text-secondary hover:bg-bg-tertiary'
                            )}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <span className="text-xl">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                        </button>
                    );
                })}
            </nav>
            <div className={'p-4 overflow-hidden'}>
                <video 
                    autoPlay 
                    loop 
                    muted 
                    src="/brand/avatar.mp4"
                    className="w-full h-auto"
                    style={{
                        imageRendering: '-webkit-optimize-contrast',
                        filter: 'blur(0.3px) contrast(1.05)',
                        WebkitFontSmoothing: 'antialiased',
                        MozOsxFontSmoothing: 'grayscale',
                        transform: 'translateY(30px) scale(1.4)',
                        objectPosition: 'top',
                        backfaceVisibility: 'hidden',
                        perspective: 1000,
                        willChange: 'transform'
                    }}
                ></video>
            </div>
        </aside>
    );
};

export default Sidebar;
