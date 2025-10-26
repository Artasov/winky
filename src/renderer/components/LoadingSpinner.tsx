import React from 'react';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'medium', className = '' }) => {
  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-16 h-16',
    large: 'w-24 h-24'
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`${sizeClasses[size]} relative`}>
        {/* Outer circle */}
        <div className="absolute inset-0 rounded-full border-4 border-primary-100" />
        
        {/* Spinning gradient circle */}
        <div 
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"
          style={{
            borderTopColor: 'var(--color-primary)',
            animationDuration: '0.8s'
          }}
        />
        
        {/* Inner glow */}
        <div 
          className="absolute inset-2 rounded-full bg-gradient-to-br from-primary/20 to-transparent animate-pulse"
          style={{
            animationDuration: '2s'
          }}
        />
      </div>
    </div>
  );
};

export default LoadingSpinner;

