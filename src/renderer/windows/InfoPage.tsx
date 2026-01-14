import React, {useEffect, useState} from 'react';
import {getVersion} from '@tauri-apps/api/app';
import {open} from '@tauri-apps/plugin-shell';
import {APP_NAME} from '@shared/constants';
import ReactMarkdown from 'react-markdown';

const COMMUNITY_LINKS = [
    {id: 'discord', label: 'Discord', icon: '/resources/community/discrod.svg', href: 'https://discord.gg/'},
    {id: 'telegram', label: 'Telegram', icon: '/resources/community/telegram.svg', href: 'https://t.me/'},
    {id: 'github', label: 'GitHub', icon: '/resources/community/github.svg', href: 'https://github.com/', invert: true},
    {id: 'x', label: 'X', icon: '/resources/community/x.svg', href: 'https://x.com/', invert: true},
    {id: 'youtube', label: 'YouTube', icon: '/resources/community/youtube.svg', href: 'https://youtube.com/'},
    {id: 'linkedin', label: 'LinkedIn', icon: '/resources/community/linkedin.svg', href: 'https://www.linkedin.com/', invert: true},
    {id: 'dexscreener', label: 'Dexscreener', icon: '/resources/community/dexscreener.svg', href: 'https://dexscreener.com/', invert: true},
    {id: 'pumpfun', label: 'Pump.fun', icon: '/resources/community/pumpfun.webp', href: 'https://pump.fun/'}
] as const;

const USAGE_GUIDE_MARKDOWN = `
## Usage Guide

### Самое важное — как запустить запись
1. **Открой микрофон**: в трее нажми Mic или используй горячую клавишу (по умолчанию Alt+Q).
2. **Начни/останови запись**: кликни по круглой кнопке микрофона в оверлее.
3. **Если запись не стартует сама**: проверь в Settings → Mic Overlay пункт Start recording automatically.

### Что ты увидишь в оверлее
- Вокруг микрофона есть иконки действий (Actions).
- По умолчанию создано два действия:
  - **Default**: отвечает на твой вопрос.
  - **Translator**: переводит речь на китайский и копирует в буфер обмена.
- Эти два действия демонстрируют базовые возможности Actions.

### Что такое Action
- Action — сценарий обработки твоей речи.
- Выбираешь действие перед записью (иконка вокруг микрофона) или запускаешь его горячей клавишей.
- Action решает, будет ли окно Result, копия ответа и звук по завершению.

### Поля Action
- Action name: название сценария, видно в списке и в History.
- Prompt: основная инструкция для LLM — что делать с текстом.
- Prompt Recognizing: подсказки для распознавания и контекста (тематика, термины, язык).
- Hotkey: опционально; запускает action напрямую.
- Icon: отображается вокруг микрофона для быстрого выбора.
- Options:
  - Show result window ? показывать окно Result.
  - Play completion sound ? звук по завершению.
  - Copy result to clipboard ? копировать ответ.
- Создание и редактирование доступны в разделе Actions (нужен вход в аккаунт).

### Где появляется результат
- Результат зависит от выбранного Action и его Options.
- Если включен Show result window — появится окно Result.
- Если включен Copy result to clipboard — ответ сразу в буфере обмена.
- Если включен Play completion sound — услышишь сигнал завершения.

### Горячая клавиша микрофона
- Меняется в Settings → Mic Overlay → Toggle Hotkey.
- Чтобы сбросить — нажми Esc или кнопку Clear рядом с полем.

### History
- Сохраняет выполненные действия и их результаты.
- Карточки раскрываются по клику.

### Notes
- Режим хранения Local / API переключается вверху страницы Notes.
- Клик по карточке открывает редактор; можно выделять и удалять пачкой.

### Настройка моделей
- В Settings укажи ключи API и выбери режимы Speech / LLM.
- Для локального Speech включи Auto-start local Whisper server или запускай сервер вручную.

### Доступ
- Управление Actions и Settings доступно после входа в аккаунт.
`;

const InfoPage: React.FC = () => {
    const [version, setVersion] = useState<string>('...');

    useEffect(() => {
        getVersion()
            .then(setVersion)
            .catch(() => {
                // Fallback если Tauri API недоступен
                setVersion('0.0.0');
            });
    }, []);

    return (
        <div className="fc mx-auto h-full w-full max-w-4xl gap-4 px-8 py-6">
            <div className="fc gap-1">
                <h1 className="text-3xl font-semibold text-text-primary">Information</h1>
                <p className="text-sm text-text-secondary">Help and information about {APP_NAME}.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <section className="card-animated card-no-lift rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">

                    <h2 className="text-2xl font-bold text-text-primary mb-2">{APP_NAME}</h2>
                    <dl className="fc text-sm">
                        <div className="frbc border-b border-primary-100 py-2">
                            <dt className="text-text-secondary">Version</dt>
                            <dd className="font-mono text-text-primary">{version}</dd>
                        </div>
                        <div className="frbc border-b border-primary-100 py-2">
                            <dt className="text-text-secondary">Platform</dt>
                            <dd className="text-text-primary">Tauri + React</dd>
                        </div>
                        <div className="frbc py-2">
                            <dt className="text-text-secondary">Status</dt>
                            <dd className="flex items-center gap-2 text-primary">
                                <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse-soft"
                                      aria-hidden="true"/>
                                Running
                            </dd>
                        </div>
                    </dl>
                </section>

                <section className="card-animated card-no-lift rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
                    <h3 className="mb-4 text-lg font-semibold text-text-primary">Community</h3>
                    <div className="flex flex-wrap gap-3">
                        {COMMUNITY_LINKS.map((link) => (
                            <button
                                key={link.id}
                                type="button"
                                onClick={() => void open(link.href)}
                                className="group flex h-11 w-11 items-center justify-center rounded-xl border border-primary-100 bg-bg-secondary/70 shadow-primary-sm transition-[transform,background-color,border-color] duration-base hover:-translate-y-0.5 hover:border-primary-200 hover:bg-primary-50"
                                aria-label={`Open ${link.label}`}
                            >
                                <img
                                    src={link.icon}
                                    alt={link.label}
                                    className={`h-6 w-6 object-contain transition-transform duration-base group-hover:scale-105 ${link.invert ? 'invert' : ''}`}
                                />
                            </button>
                        ))}
                    </div>
                </section>
            </div>

            <section className="card-animated card-no-lift rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
                <div className="markdown-compact text-text-primary">
                    <ReactMarkdown>{USAGE_GUIDE_MARKDOWN}</ReactMarkdown>
                </div>
            </section>
        </div>
    );
};

export default InfoPage;

