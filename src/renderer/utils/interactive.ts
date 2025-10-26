let hoverCount = 0;
let disableTimeout: ReturnType<typeof setTimeout> | null = null;

const applyInteractive = () => {
  if (hoverCount > 0) {
    if (disableTimeout) {
      clearTimeout(disableTimeout);
      disableTimeout = null;
    }
    void window.winky?.mic?.setInteractive(true);
  } else {
    if (disableTimeout) {
      return;
    }
    disableTimeout = setTimeout(() => {
      disableTimeout = null;
      if (hoverCount === 0) {
        void window.winky?.mic?.setInteractive(false);
      }
    }, 80);
  }
};

export const interactiveEnter = () => {
  hoverCount += 1;
  applyInteractive();
};

export const interactiveLeave = () => {
  if (hoverCount > 0) {
    hoverCount -= 1;
    applyInteractive();
  }
};

export const resetInteractive = () => {
  hoverCount = 0;
  if (disableTimeout) {
    clearTimeout(disableTimeout);
    disableTimeout = null;
  }
  void window.winky?.mic?.setInteractive(false);
};
