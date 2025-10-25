import React from 'react';
import { APP_NAME } from '@shared/constants';

const InfoPage: React.FC = () => {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 px-8 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-white">Информация</h1>
        <p className="text-sm text-slate-400">Справка и сведения о {APP_NAME}.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 text-6xl">👁️</div>
            <h2 className="text-2xl font-bold text-white">{APP_NAME}</h2>
            <p className="text-sm text-slate-400">Голосовой ассистент</p>
          </div>

          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between border-b border-white/5 py-2">
              <dt className="text-slate-400">Версия</dt>
              <dd className="font-mono text-slate-200">1.0.0</dd>
            </div>
            <div className="flex items-center justify-between border-b border-white/5 py-2">
              <dt className="text-slate-400">Платформа</dt>
              <dd className="text-slate-200">Electron + React</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-slate-400">Статус</dt>
              <dd className="flex items-center gap-2 text-emerald-400">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                Работает
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">Возможности</h3>
          <ul className="flex flex-col gap-2 text-sm text-slate-300">
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Распознавание речи</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Обработка через LLM</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Быстрые действия</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Плавающий микрофон</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default InfoPage;

