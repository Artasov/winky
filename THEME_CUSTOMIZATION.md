# Настройка цветовой темы Winky

## Основные цвета темы

Все основные цвета темы находятся в двух местах для удобной настройки:

### 1. CSS переменные (src/renderer/styles/theme.sass)

В начале файла `theme.sass` находятся CSS переменные с основными цветами:

```sass
:root
  // Основные цвета (красно-розовая палитра)
  --color-primary: #e11d48          // Основной красно-розовый
  --color-primary-light: #fb7185    // Светлый оттенок
  --color-primary-dark: #be123c     // Темный оттенок
  --color-primary-hover: #f43f5e    // Цвет при наведении
  
  // Фоновые цвета (белая основа)
  --color-bg-base: #ffffff          // Основной фон
  --color-bg-secondary: #fef2f2     // Вторичный фон
  --color-bg-tertiary: #fee2e2      // Третичный фон
  --color-bg-elevated: #fafafa      // Приподнятые элементы
  
  // Текстовые цвета
  --color-text-primary: #1e293b     // Основной текст
  --color-text-secondary: #64748b   // Вторичный текст
  --color-text-tertiary: #94a3b8    // Третичный текст
  --color-text-inverse: #ffffff     // Инверсный текст
  
  // Границы
  --color-border-light: #fecdd3     // Светлые границы
  --color-border-base: #fda4af      // Базовые границы
  --color-border-strong: #fb7185    // Яркие границы
```

### 2. Tailwind конфигурация (tailwind.config.js)

В файле `tailwind.config.js` дублируются цвета для использования в классах Tailwind:

```javascript
colors: {
  primary: {
    DEFAULT: '#e11d48',
    light: '#fb7185',
    dark: '#be123c',
    hover: '#f43f5e',
    // ... полная палитра от 50 до 900
  },
  bg: {
    base: '#ffffff',
    secondary: '#fef2f2',
    tertiary: '#fee2e2',
    elevated: '#fafafa',
  },
  // ... остальные цвета
}
```

## Как изменить цветовую схему

### Вариант 1: Изменить на другой оттенок красного

Просто измените значения переменных `--color-primary-*` в обоих файлах на нужные HEX-коды.

Например, для более яркого красного:
- `--color-primary: #dc2626` (red-600)
- `--color-primary-light: #f87171` (red-400)
- `--color-primary-dark: #991b1b` (red-800)

### Вариант 2: Изменить на совершенно другой цвет

Например, для синей темы:
- `--color-primary: #2563eb` (blue-600)
- `--color-primary-light: #60a5fa` (blue-400)
- `--color-primary-dark: #1e40af` (blue-800)
- `--color-primary-hover: #3b82f6` (blue-500)

Также обновите фоновые цвета:
- `--color-bg-secondary: #eff6ff` (blue-50)
- `--color-bg-tertiary: #dbeafe` (blue-100)

И границы:
- `--color-border-light: #bfdbfe` (blue-200)
- `--color-border-base: #93c5fd` (blue-300)
- `--color-border-strong: #60a5fa` (blue-400)

### Вариант 3: Темная тема

Для темной темы измените:
- `--color-bg-base: #0f172a` (slate-900)
- `--color-bg-secondary: #1e293b` (slate-800)
- `--color-bg-tertiary: #334155` (slate-700)
- `--color-text-primary: #f1f5f9` (slate-100)
- `--color-text-secondary: #cbd5e1` (slate-300)
- `--color-text-tertiary: #94a3b8` (slate-400)

## Анимации и эффекты

Все анимации настраиваются через переменные в `theme.sass`:

```sass
// Длительности анимаций
--duration-fast: 150ms
--duration-base: 250ms
--duration-slow: 350ms

// Функции плавности
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1)
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55)
--ease-in-out: cubic-bezier(0.645, 0.045, 0.355, 1)
```

## Применение изменений

После изменения цветов:

1. Сохраните оба файла (`theme.sass` и `tailwind.config.js`)
2. Перезапустите dev-сервер: `npm run dev`
3. Или пересоберите проект: `npm run build:renderer`

## Готовые классы для использования

В коде доступны следующие классы:
- `button-primary` - основная кнопка с анимацией
- `button-secondary` - вторичная кнопка
- `button-animated` - базовая анимация для кнопок
- `input-animated` - анимированный инпут
- `select-animated` - анимированный селект
- `checkbox-animated` - анимированный чекбокс
- `card-animated` - анимированная карточка
- `nav-item-animated` - анимированный элемент навигации
- `text-gradient` - градиентный текст
- `glass-effect` - эффект стекла

Все эти классы автоматически адаптируются к выбранной цветовой схеме.

