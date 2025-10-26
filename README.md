# Winky

Кроссплатформенное десктопное приложение на базе Electron + React для голосового ассистента.

## Стек и версии

- Node.js 20 (LTS)
- Electron 26
- React 18
- Tailwind CSS 3.3
- TypeScript 5

## Скрипты

### Разработка
- `npm run dev` — запуск режима разработки (рендерер через Vite, основной процесс через tsup, автостарт Electron).
- `npm start` — сборка бандлов и запуск Electron в production-режиме.
- `npm run build:assets` — сборка основных бандлов (main + renderer).

### Сборка установщиков
- `npm run build` — упаковка приложения для текущей платформы.
- `npm run build:win` — сборка установщика для Windows (x64 + ia32).
- `npm run build:mac` — сборка установщика для macOS (Intel + Apple Silicon).
- `npm run build:linux` — сборка установщиков для Linux (AppImage, DEB, RPM, Snap).
- `npm run build:all` — сборка для всех платформ сразу.
- `npm run build:ci` — упаковка и публикация (используется в CI).

### Проверка кода
- `npm run lint` / `npm run typecheck` — проверка типов.

## Конфигурация

Все настройки хранятся в `Electron Store` в файле `config.json` в стандартной директории `userData`. Структура конфигурации соответствует ТЗ: токены аутентификации, режимы работы сервисов, API ключи и пользовательские действия.

## CI/CD

Workflow `.github/workflows/build.yml` собирает приложение под Windows, macOS и Linux, загружает артефакты и формирует черновик релиза при публикации тега `v*`.

## Первый запуск

1. Установите зависимости: `npm install`.
2. Запустите `npm run dev` для режима разработки.
3. Для production-сборки: `npm start` (выполняет предварительную сборку) или `npm run build` для полноценного инсталлятора.

## Сборка установщиков

```bash
npm run build:win     # Windows (x64 + ia32)
npm run build:mac     # macOS (Intel + Apple Silicon)
npm run build:linux   # Linux (AppImage, DEB)
npm run build:all     # Все платформы
```

Результат в папке `release/`
