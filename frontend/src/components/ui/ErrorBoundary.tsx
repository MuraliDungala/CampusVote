import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled component error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] p-6 text-center bg-surface-canvas">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4 shadow-sm border border-red-200">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-navy-950 mb-1">
            {this.props.fallbackTitle || 'Component Error'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
            {this.props.fallbackMessage ||
              'An unexpected error occurred while rendering this component. The rest of the application remains secure.'}
          </p>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={this.handleReset}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Try Again
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = '/';
              }}
              leftIcon={<Home className="w-4 h-4" />}
            >
              Return Home
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
