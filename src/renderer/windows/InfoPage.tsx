import React from 'react';
import { APP_NAME } from '@shared/constants';

const InfoPage: React.FC = () => {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 px-8 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-text-primary">Информация</h1>
        <p className="text-sm text-text-secondary">Справка и сведения о {APP_NAME}.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card-animated rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 text-6xl">👁️</div>
            <h2 className="text-2xl font-bold text-text-primary">{APP_NAME}</h2>
            <p className="text-sm text-text-secondary">Голосовой ассистент</p>
          </div>

          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between border-b border-primary-100 py-2">
              <dt className="text-text-secondary">Версия</dt>
              <dd className="font-mono text-text-primary">1.0.0</dd>
            </div>
            <div className="flex items-center justify-between border-b border-primary-100 py-2">
              <dt className="text-text-secondary">Платформа</dt>
              <dd className="text-text-primary">Electron + React</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-text-secondary">Статус</dt>
              <dd className="flex items-center gap-2 text-primary">
                <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse-soft" aria-hidden="true" />
                Работает
              </dd>
            </div>
          </dl>
        </section>

        <section className="card-animated rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">Возможности</h3>
          <ul className="flex flex-col gap-2 text-sm text-text-primary">
            <li className="flex items-center gap-2">
              <span className="text-primary">✓</span>
              <span>Распознавание речи</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary">✓</span>
              <span>Обработка через LLM</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary">✓</span>
              <span>Быстрые действия</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary">✓</span>
              <span>Плавающий микрофон</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default InfoPage;

