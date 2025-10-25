import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import classNames from 'classnames';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

const navItems: NavItem[] = [
  { id: 'me', label: 'Me', icon: '👤', path: '/me' },
  { id: 'actions', label: 'Actions', icon: '⚡', path: '/actions' },
  { id: 'settings', label: 'Settings', icon: '⚙️', path: '/settings' },
  { id: 'info', label: 'Info', icon: 'ℹ️', path: '/info' }
];

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-800/60 bg-slate-950/80 backdrop-blur">
      <div className="px-6 pb-4 pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Навигация</p>
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
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60',
                isActive
                  ? 'bg-emerald-500/15 text-emerald-300 shadow shadow-emerald-500/20 ring-1 ring-emerald-400/40'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-6 pb-6 text-xs text-slate-500">
        <p className="leading-relaxed">
          Быстрый доступ к профилю, действиям и настройкам Winky в одном окне.
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
