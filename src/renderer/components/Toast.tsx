import React from 'react';
import classNames from 'classnames';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const variantStyles: Record<ToastType, string> = {
  success: 'bg-emerald-500/90 border-emerald-400',
  error: 'bg-rose-500/90 border-rose-400',
  info: 'bg-slate-700/90 border-slate-500'
};

const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed right-6 top-6 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={classNames(
            'flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur',
            variantStyles[toast.type]
          )}
        >
          <div className="flex-1 text-sm font-medium leading-5">{toast.message}</div>
          <button
            type="button"
            className="ml-auto text-lg leading-none text-white/80 transition hover:text-white"
            onClick={() => onDismiss(toast.id)}
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

export default Toast;
