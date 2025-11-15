import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useConfig} from '../context/ConfigContext';
import {useUser} from '../context/UserContext';
import {useToast} from '../context/ToastContext';
import {useAuth} from '../auth';
import TitleBar from '../components/TitleBar';
import type {AuthProvider} from '@shared/types';

const AuthWindow: React.FC = () => {
    const {refreshConfig} = useConfig();
    const {fetchUser} = useUser();
    const {showToast} = useToast();
    const auth = useAuth();
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
            console.log('[AuthWindow] login submit', {email});
            const {config: updated} = await window.winky.auth.login(email, password);

            // Обновляем конфиг
            await refreshConfig();

            // Пытаемся загрузить пользователя, но не блокируем если не удалось
            try {
                await fetchUser();
            } catch (userError) {
                console.warn('[AuthWindow] Failed to fetch user, but continuing:', userError);
                // Не блокируем авторизацию если не удалось загрузить пользователя
            }

            showToast('Авторизация успешна', 'success');

            if (!updated.setupCompleted) {
                // Если настройка не завершена, идем на страницу setup
                navigate('/setup');
            } else {
                // Если настройка завершена, главное окно будет закрыто,
                // а микрофон уже создан в main process
                // Ничего не делаем, окно закроется автоматически
            }
        } catch (error) {
            console.error('[AuthWindow] login failed', error);
            showToast('Не удалось авторизоваться. Проверьте данные и подключение.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleOAuth = async (provider: AuthProvider) => {
        try {
            await auth.startOAuth(provider);
            showToast(`Открываем ${provider} для авторизации...`, 'info');
        } catch (error) {
            console.error('[AuthWindow] OAuth failed', error);
            showToast(`Не удалось запустить OAuth через ${provider}`, 'error');
        }
    };

    return (
        <div className="flex h-full flex-col">
            <TitleBar/>
            <div className="mx-auto flex flex-1 w-full max-w-md flex-col justify-center px-6 py-10">
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

                <div className="mt-6">
                    <div className="grid grid-cols-3 gap-3">
                        <button
                            type="button"
                            onClick={() => handleOAuth('google')}
                            disabled={auth.isBusy}
                            className="frcc w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <svg className="h-5 w-5" viewBox="0 0 24 24">
                                <path fill="#4285F4"
                                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853"
                                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05"
                                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335"
                                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                        </button>

                        <button
                            type="button"
                            onClick={() => handleOAuth('github')}
                            disabled={auth.isBusy}
                            className="frcc w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd"
                                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                                      clipRule="evenodd"/>
                            </svg>
                        </button>

                        <button
                            type="button"
                            onClick={() => handleOAuth('discord')}
                            disabled={auth.isBusy}
                            className="frcc w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <svg className="h-5 w-5" fill="#5865F2" viewBox="0 0 24 24">
                                <path
                                    d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthWindow;
