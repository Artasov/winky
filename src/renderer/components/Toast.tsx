import React from 'react';
import classNames from 'classnames';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

type ToastPlacement = 'top-right' | 'bottom-right' | 'center-right';

interface ToastProps {
  toasts: ToastMessage[];
  placement?: ToastPlacement;
  className?: string;
}

const variantStyles: Record<ToastType, string> = {
  success: 'bg-emerald-500/90 border-emerald-400',
  error: 'bg-rose-500/90 border-rose-400',
  info: 'bg-slate-700/90 border-slate-500'
};

const placementClass: Record<ToastPlacement, string> = {
  'top-right': 'right-6 top-6',
  'bottom-right': 'right-6 bottom-6',
  'center-right': 'right-6 top-1/2 -translate-y-1/2'
};

const Toast: React.FC<ToastProps> = ({ toasts, placement = 'top-right', className }) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className={classNames(
        'pointer-events-none fixed z-50 flex w-80 flex-col gap-2 transition-all duration-150',
        placementClass[placement],
        className
      )}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={classNames(
            'flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur',
            variantStyles[toast.type]
          )}
        >
          <div className="flex-1 text-sm font-medium leading-5">{toast.message}</div>
        </div>
      ))}
    </div>
  );
};

export default Toast;
