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
    <div className="fc h-full w-24 bg-slate-900 border-r border-white/10 shrink-0">
      <div className="fc gap-3 p-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigation(item.path)}
              className={classNames(
                'fcc rounded-xl p-4 transition-all',
                isActive
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/20 scale-105'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 hover:scale-105'
              )}
              title={item.label}
            >
              <span className="text-3xl mb-2">{item.icon}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Sidebar;

