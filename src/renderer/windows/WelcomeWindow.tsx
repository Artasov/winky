import React from 'react';
import { useNavigate } from 'react-router-dom';

const WelcomeWindow: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-text-primary">Welcome to <span className="text-gradient">Winky</span></h1>
      <p className="max-w-xl text-lg text-text-secondary">
        Winky helps you quickly convert voice to text and run intelligent LLM-powered actions. Click
        "Next" to sign in and set up the application.
      </p>
      <button
        type="button"
        onClick={() => navigate('/auth')}
        className="button-primary rounded-lg px-6 py-3 text-base font-semibold shadow-primary-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-2 focus:ring-offset-white"
      >
        Next
      </button>
    </div>
  );
};

export default WelcomeWindow;
