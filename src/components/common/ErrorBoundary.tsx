import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
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
    console.error('[StepFlow ErrorBoundary] Caught render error:', error, errorInfo);
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
        <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 select-none">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 shadow-sm">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold mb-1">
            {this.props.fallbackTitle || 'Something went wrong displaying this view'}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md text-center mb-6 leading-relaxed">
            {this.state.error?.message || 'An unexpected rendering error occurred. You can reload this view or return to your project library.'}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
            <button
              type="button"
              onClick={() => {
                this.handleReset();
                if (typeof window !== 'undefined') {
                  window.location.hash = '';
                }
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Return Home</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
