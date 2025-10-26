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
  success: 'bg-primary/90 border-primary text-white',
  error: 'bg-primary-dark/90 border-primary-dark text-white',
  info: 'bg-white border-primary-200 text-text-primary shadow-primary-md'
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
        'pointer-events-none fixed z-50 flex w-80 flex-col gap-2 transition-all duration-base',
        placementClass[placement],
        className
      )}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={classNames(
            'animate-fade-in-up flex items-start gap-3 rounded-lg border px-4 py-3 shadow-primary-lg backdrop-blur transition-all duration-base',
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
