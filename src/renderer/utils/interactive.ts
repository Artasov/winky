let hoverCounter = 0;
let dragActive = false;
let recordingActive = false;

const applyState = () => {
    // Окно должно быть интерактивным только когда:
    // 1. Есть наведение на элементы (hoverCounter > 0) - для взаимодействия с кнопками
    // 2. Активно перетаскивание (dragActive) - для перетаскивания окна
    // НЕ включаем recordingActive в условие, чтобы клики проходили сквозь прозрачные области во время записи
    // Элементы управления будут работать через pointer-events: auto в CSS
    const shouldBeInteractive = hoverCounter > 0 || dragActive;
    console.log('[interactive] applyState', {
        hoverCounter,
        dragActive,
        recordingActive,
        shouldBeInteractive
    });
    // Явно вызываем setInteractive для гарантии интерактивности окна
    // Особенно важно при автоматическом старте записи
    if (shouldBeInteractive) {
        // Используем Promise для гарантии, что вызов выполнится
        Promise.resolve(window.winky?.mic?.setInteractive(true)).catch(() => {
            // Игнорируем ошибки, но гарантируем выполнение
        });
    } else {
        // КРИТИЧНО: Когда нет наведения и перетаскивания, окно должно быть неинтерактивным
        // чтобы клики проходили сквозь прозрачные области
        void window.winky?.mic?.setInteractive(false);
    }
};

export const interactiveEnter = () => {
    hoverCounter += 1;
    if (hoverCounter === 1) {
        applyState();
    }
};

export const interactiveLeave = () => {
    if (hoverCounter === 0) {
        return;
    }
    hoverCounter -= 1;
    // Не сбрасываем состояние интерактивности, если активно перетаскивание
    // recordingActive больше не влияет на интерактивность окна
    if (hoverCounter === 0 && !dragActive) {
        applyState();
    }
};

export const resetInteractive = () => {
    hoverCounter = 0;
    dragActive = false;
    recordingActive = false;
    applyState();
};

export const setDragInteractive = (enabled: boolean) => {
    if (dragActive === enabled) {
        return;
    }
    dragActive = enabled;
    applyState();
};

export const setRecordingInteractive = (enabled: boolean) => {
    if (recordingActive === enabled) {
        return;
    }
    recordingActive = enabled;
    applyState();
};
