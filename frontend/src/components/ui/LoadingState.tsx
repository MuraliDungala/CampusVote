import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading data...',
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-12 text-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-4" />
      <p className="text-sm font-medium text-slate-600">{message}</p>
      <span className="sr-only">Loading</span>
    </div>
  );
};
