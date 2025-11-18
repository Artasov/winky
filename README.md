# Winky

Кроссплатформенное десктопное приложение на базе **Tauri + React + Vite** для голосового ассистента.

## Стек и версии

- Node.js 20 (LTS)
- Rust 1.80+ (для сборки Tauri)
- Tauri 2
- React 18 / Vite 7 / Tailwind CSS 4
- TypeScript 5

## Скрипты

- `npm run dev` — дев-сервер Vite + tauri dev (автоматический запуск нативной части).
- `npm run build` — полноценная упаковка через `tauri build`.
- `npm run typecheck` / `npm run lint` — проверка типов (tsc).
- `npm run preview` — предпросмотр собранного фронтенда (без запуска Tauri).

## Конфигурация

Tauri хранит настройки в `src-tauri` (JSON-файл `config.json` в `AppData`/`~/.config`). Структура соответствует прежнему `Electron Store`: токены auth, ключи API, параметры микрофона, хоткеи и т.д. В рантайме с конфигом работает `ConfigState` (Rust) + `window.winky.config` в renderer.

## CI/CD

Workflow `.github/workflows/build.yml` требует обновления под Tauri. Для локальной сборки всех артефактов используйте `npm run build` (см. документацию Tauri по подписи и CI).

## Первый запуск

1. Установите зависимости ноды и cargo: `npm install`.
2. Убедитесь, что установлен Rust toolchain + необходимые системные библиотеки (см. [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)).
3. Запустите `npm run dev` — откроется основное окно и мост с нативной частью.
4. Production-сборка: `npm run build` (артефакты появятся в `src-tauri/target/<platform>/release`).

## Горячие клавиши и окна

Нативная часть регистрирует глобальные хоткеи (микрофон и действия) и управляет фоновыми сервисами (fast-fast-whisper, автозапуск, OAuth deep links, системный трей). Renderer работает через мост `window.winky.*`:

- `window.winky.mic.*` — управление микрофонным оверлеем (show/hide/toggle, позиционирование, drag).
- `window.winky.localSpeech` — управление fast-whisper (установка, рестарт, onStatus).
- `window.winky.actionHotkeys` — регистрация горячих клавиш действий.

## Сборка установщиков

После `npm run build` Tauri создаёт готовые пакеты в `src-tauri/target/release`. Для подписи и публикации используйте инструкции Tauri для вашей ОС.
