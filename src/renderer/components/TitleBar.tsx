import React from 'react';

interface TitleBarProps {
  title?: string;
  showWinkyButton?: boolean;
  onWinkyClick?: () => void;
}

const TitleBar: React.FC<TitleBarProps> = ({ title = 'Winky', showWinkyButton = false, onWinkyClick }) => {
  const handleMinimize = () => {
    window.winky?.windowControls.minimize().catch((error) => {
      console.error('[TitleBar] Не удалось свернуть окно', error);
    });
  };

  const handleClose = () => {
    window.winky?.windowControls.close().catch((error) => {
      console.error('[TitleBar] Не удалось закрыть окно', error);
    });
  };

  return (
    <div className="app-region-drag flex w-full h-11 items-center justify-between border-b border-white/10 bg-slate-900 px-4 text-xs uppercase tracking-[0.25em] text-slate-400 shrink-0">
      <div className="pointer-events-none select-none font-semibold text-slate-200">{title}</div>
      <div className="app-region-no-drag flex items-center gap-3">
        {showWinkyButton && onWinkyClick && (
          <button
            type="button"
            onClick={onWinkyClick}
            className="flex h-7 items-center justify-center rounded-md px-2 text-[10px] font-semibold tracking-[0.2em] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Winky
          </button>
        )}
        <button
          type="button"
          onClick={handleMinimize}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Свернуть"
        >
          <svg viewBox="0 0 12 2" className="h-2 w-3 fill-current">
            <rect width="12" height="2" rx="1" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-rose-500/80 hover:text-white"
          aria-label="Закрыть"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
            <path d="M1.28 0 0 1.28 4.72 6 0 10.72 1.28 12 6 7.28 10.72 12 12 10.72 7.28 6 12 1.28 10.72 0 6 4.72Z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
