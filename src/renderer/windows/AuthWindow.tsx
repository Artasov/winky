import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';

const AuthWindow: React.FC = () => {
  const { refreshConfig } = useConfig();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      showToast('Введите email и пароль', 'error');
      return;
    }

    setLoading(true);
    try {
      if (!window.winky?.auth) {
        throw new Error('Preload API недоступен');
      }
      console.log('[AuthWindow] login submit', { email });
      const { config: updated } = await window.winky.auth.login(email, password);
      await refreshConfig();
      showToast('Авторизация успешна', 'success');
      if (!updated.setupCompleted) {
        navigate('/setup');
      } else {
        navigate('/main');
      }
    } catch (error) {
      console.error('[AuthWindow] login failed', error);
      showToast('Не удалось авторизоваться. Проверьте данные и подключение.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center px-6 py-10">
      <h2 className="mb-6 text-3xl font-semibold text-text-primary">Sign In</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm text-text-primary">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input-animated rounded-md border border-primary-200 bg-white px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-text-primary">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input-animated rounded-md border border-primary-200 bg-white px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="button-primary mt-4 rounded-lg px-4 py-2 text-base font-semibold shadow-primary-md disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
};

export default AuthWindow;
