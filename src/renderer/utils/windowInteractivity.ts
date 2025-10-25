const getState = () => {
  const globalWindow = window as typeof window & {
    __winkyInteractiveState?: {
      locks: number;
      timer: number | null;
    };
  };

  if (!globalWindow.__winkyInteractiveState) {
    globalWindow.__winkyInteractiveState = { locks: 0, timer: null };
  }

  return globalWindow.__winkyInteractiveState;
};

const applyInteractive = (interactive: boolean) => {
  window.winky?.windowControls
    .setInteractive(interactive)
    .catch((error) => console.error('[windowInteractivity] Не удалось изменить click-through состояние', error));
};

export const acquireInteractivity = () => {
  const state = getState();
  state.locks += 1;
  if (state.timer) {
    window.clearTimeout(state.timer);
    state.timer = null;
  }
  applyInteractive(true);
};

export const releaseInteractivity = (delay = 120) => {
  const state = getState();
  state.locks = Math.max(0, state.locks - 1);
  if (state.locks > 0) {
    return;
  }

  if (state.timer) {
    window.clearTimeout(state.timer);
  }

  state.timer = window.setTimeout(() => {
    state.timer = null;
    if (state.locks === 0) {
      applyInteractive(false);
    }
  }, delay);
};

export const resetInteractivity = () => {
  const state = getState();
  if (state.timer) {
    window.clearTimeout(state.timer);
    state.timer = null;
  }
  state.locks = 0;
};
