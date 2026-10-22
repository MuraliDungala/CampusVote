import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'An unexpected error occurred while communicating with the service.',
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`text-center py-10 px-4 rounded-xl border border-red-200 bg-red-50/50 ${className}`}
      role="alert"
    >
      <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-red-950 mb-1">{title}</h3>
      <p className="text-sm text-red-700/80 max-w-sm mx-auto mb-6 leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          leftIcon={<RotateCcw className="w-4 h-4" />}
          className="border-red-300 text-red-700 hover:bg-red-100/50"
        >
          Try Again
        </Button>
      )}
    </div>
  );
};
