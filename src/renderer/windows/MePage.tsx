import React from 'react';
import { useConfig } from '../context/ConfigContext';

const MePage: React.FC = () => {
  const { config } = useConfig();
  const isAuthorized = Boolean(config?.auth.accessToken);

  return (
    <div className="fc h-full p-8 gap-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Мой профиль</h1>
        <p className="text-sm text-slate-400">Информация о вашем аккаунте</p>
      </div>

      {!isAuthorized ? (
        <div className="fcc flex-1 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 py-16">
          <div className="text-4xl mb-4 opacity-50">👤</div>
          <p className="text-slate-400">Авторизуйтесь для просмотра профиля</p>
        </div>
      ) : (
        <div className="fc gap-4">
          <div className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold mb-4">Статус авторизации</h2>
            <div className="frc gap-2 text-sm">
              <span className="frc w-3 h-3 rounded-full bg-emerald-500"></span>
              <span className="text-slate-300">Авторизован</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MePage;

