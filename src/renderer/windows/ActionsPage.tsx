import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfig } from '../context/ConfigContext';

const ActionsPage: React.FC = () => {
  const { config } = useConfig();
  const navigate = useNavigate();
  const actions = useMemo(() => config?.actions ?? [], [config?.actions]);
  const isAuthorized = Boolean(config?.auth.accessToken);

  return (
    <div className="fc h-full p-8 gap-6">
      <div className="frbc">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Действия</h1>
          <p className="text-sm text-slate-400">Все ваши быстрые действия</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Управление
        </button>
      </div>

      {!isAuthorized ? (
        <div className="fcc flex-1 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 py-16">
          <div className="text-4xl mb-4 opacity-50">⚡</div>
          <p className="text-slate-400">Авторизуйтесь для просмотра действий</p>
        </div>
      ) : actions.length === 0 ? (
        <div className="fcc flex-1 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 py-16">
          <div className="text-4xl mb-4 opacity-50">⚡</div>
          <p className="text-slate-400 mb-2">Нет действий</p>
          <p className="text-xs text-slate-500">Добавьте новое в настройках</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {actions.map((action) => (
            <div
              key={action.id}
              className="fc rounded-lg border border-white/10 bg-white/5 p-6 hover:border-white/20 hover:bg-white/10 transition"
            >
              <div className="frc gap-3 mb-3">
                {action.icon_details?.svg ? (
                  <div className="fcc rounded-lg bg-slate-800 p-3">
                    <img 
                      src={action.icon_details.svg}
                      alt=""
                      className="w-8 h-8"
                    />
                  </div>
                ) : (
                  <div className="fcc rounded-lg bg-slate-800 p-3 text-2xl">⚡</div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold truncate">{action.name}</h3>
                  <p className="text-xs text-slate-500">{action.icon_details?.name || 'Без иконки'}</p>
                </div>
              </div>
              <p className="text-sm text-slate-300 line-clamp-3">{action.prompt}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActionsPage;

