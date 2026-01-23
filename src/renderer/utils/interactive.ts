let hoverCounter = 0;
let dragActive = false;
let recordingActive = false;
let proximityInteractive = false;
let forceInteractive = false;

const applyState = () => {
    // Проверяем что мы действительно в окне микрофона перед выполнением
    if (typeof window === 'undefined') {
        return;
    }
    const params = new URLSearchParams(window.location.search);
    const isMicWindow = params.get('window') === 'mic';
    if (!isMicWindow) {
        // Не выполняем если мы не в окне микрофона
        return;
    }

    // Проверяем что API доступен перед вызовом
    if (!window.winky?.mic?.setInteractive) {
        return;
    }

    const shouldBeInteractive = hoverCounter > 0 || dragActive || proximityInteractive;
    const interactive = forceInteractive || shouldBeInteractive;

    Promise.resolve(window.winky.mic.setInteractive(interactive)).catch(() => {});
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
    proximityInteractive = false;
    // Не вызываем applyState сразу - окно может быть еще не создано
    // Вместо этого просто сбрасываем счетчики
    // applyState будет вызван автоматически при следующем взаимодействии
    // Проверяем что мы действительно в окне микрофона перед вызовом applyState
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const isMicWindow = params.get('window') === 'mic';
        if (isMicWindow && window.winky?.mic?.setInteractive) {
            // Вызываем applyState только если мы в окне микрофона
            applyState();
        }
    }
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

export const setProximityInteractive = (enabled: boolean) => {
    if (proximityInteractive === enabled) {
        return;
    }
    proximityInteractive = enabled;
    applyState();
};

export const setForceInteractive = (enabled: boolean) => {
    if (forceInteractive === enabled) {
        return;
    }
    forceInteractive = enabled;
    applyState();
};
