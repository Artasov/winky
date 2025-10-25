import React from 'react';
import { APP_NAME } from '@shared/constants';

const InfoPage: React.FC = () => {
  return (
    <div className="fc h-full p-8 gap-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Информация</h1>
        <p className="text-sm text-slate-400">О приложении {APP_NAME}</p>
      </div>

      <div className="fc gap-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <div className="fcc mb-6">
            <div className="text-6xl mb-4">👁️</div>
            <h2 className="text-2xl font-bold">{APP_NAME}</h2>
            <p className="text-sm text-slate-400">Голосовой ассистент</p>
          </div>
          
          <div className="fc gap-3 text-sm">
            <div className="frbc py-2 border-b border-white/5">
              <span className="text-slate-400">Версия</span>
              <span className="font-mono text-slate-200">1.0.0</span>
            </div>
            <div className="frbc py-2 border-b border-white/5">
              <span className="text-slate-400">Платформа</span>
              <span className="text-slate-200">Electron + React</span>
            </div>
            <div className="frbc py-2">
              <span className="text-slate-400">Статус</span>
              <span className="frc gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-emerald-400">Работает</span>
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <h3 className="text-lg font-semibold mb-3">Возможности</h3>
          <ul className="fc gap-2 text-sm text-slate-300">
            <li className="frc gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Распознавание речи</span>
            </li>
            <li className="frc gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Обработка через LLM</span>
            </li>
            <li className="frc gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Быстрые действия</span>
            </li>
            <li className="frc gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Плавающий микрофон</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default InfoPage;

