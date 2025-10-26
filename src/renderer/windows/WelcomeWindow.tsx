import React from 'react';
import { useNavigate } from 'react-router-dom';

const WelcomeWindow: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-text-primary">Добро пожаловать в <span className="text-gradient">Winky</span></h1>
      <p className="max-w-xl text-lg text-text-secondary">
        Winky помогает быстро преобразовать голос в текст и запускать интеллектуальные действия на базе LLM. Нажмите
        «Далее», чтобы войти и настроить приложение.
      </p>
      <button
        type="button"
        onClick={() => navigate('/auth')}
        className="button-primary rounded-lg px-6 py-3 text-base font-semibold shadow-primary-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-2 focus:ring-offset-white"
      >
        Далее
      </button>
    </div>
  );
};

export default WelcomeWindow;
