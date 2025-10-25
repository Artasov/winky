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
    <div className="app-region-drag flex h-12 w-full items-center justify-between border-b border-slate-800/60 bg-slate-950/80 px-4 text-xs uppercase tracking-[0.3em] text-slate-400 backdrop-blur">
      <div className="pointer-events-none select-none font-semibold text-slate-200">{title}</div>
      <div className="app-region-no-drag flex items-center gap-2 text-slate-300">
        {showWinkyButton && onWinkyClick && (
          <button
            type="button"
            onClick={onWinkyClick}
            className="flex h-8 items-center justify-center rounded-lg px-3 text-[10px] font-semibold tracking-[0.2em] text-emerald-200 transition hover:bg-emerald-500/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          >
            Winky
          </button>
        )}
        <button
          type="button"
          onClick={handleMinimize}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
          aria-label="Свернуть"
        >
          <svg viewBox="0 0 12 2" className="h-2 w-3 fill-current">
            <rect width="12" height="2" rx="1" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-rose-500/80 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
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
