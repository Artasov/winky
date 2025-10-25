import React from 'react';
import { useNavigate } from 'react-router-dom';

const WelcomeWindow: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-white">Добро пожаловать в Winky</h1>
      <p className="max-w-xl text-lg text-slate-300">
        Winky помогает быстро преобразовать голос в текст и запускать интеллектуальные действия на базе LLM. Нажмите
        «Далее», чтобы войти и настроить приложение.
      </p>
      <button
        type="button"
        onClick={() => navigate('/auth')}
        className="rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        Далее
      </button>
    </div>
  );
};

export default WelcomeWindow;
