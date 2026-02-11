// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Fallback component to render when an error occurs */
  fallback?: ReactNode;
  /** Callback called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Component name for logging purposes */
  componentName?: string;
  /** Whether to show the reset button */
  showReset?: boolean;
  /** Custom reset callback */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorCount: number;
}

/**
 * Enhanced Error Boundary component for catching React errors gracefully.
 * 
 * Features:
 * - Catches errors in child component tree
 * - Displays user-friendly fallback UI
 * - Supports custom fallback components
 * - Tracks error count for crash loops
 * - Provides error reset functionality
 * - Logs errors for debugging
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false,
      errorCount: 0 
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { componentName, onError } = this.props;
    
    // Update state with error info
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // Log error with component context
    const context = componentName ? `[${componentName}] ` : '';
    console.error(`${context}Error caught by boundary:`, error);
    console.error(`${context}Component stack:`, errorInfo.componentStack);

    // Call custom error handler if provided
    onError?.(error, errorInfo);

    // Report to error tracking service if available
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(error, {
        extra: { 
          componentStack: errorInfo.componentStack,
          componentName 
        }
      });
    }
  }

  /**
   * Reset the error boundary state
   */
  handleReset = () => {
    const { onReset } = this.props;
    
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined 
    });
    
    onReset?.();
  };

  /**
   * Reload the page as a last resort
   */
  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error, errorInfo, errorCount } = this.state;
    const { children, fallback, showReset = true } = this.props;

    if (hasError) {
      // If custom fallback is provided, use it
      if (fallback) {
        return <>{fallback}</>;
      }

      // Check for crash loop (more than 3 errors)
      const isCrashLoop = errorCount > 3;

      return (
        <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <div className="text-6xl mb-4">
              {isCrashLoop ? "🔥" : ":("}
            </div>
            <h1 className="text-2xl font-medium text-white mb-4">
              {isCrashLoop 
                ? "Problème récurrent détecté" 
                : "Une erreur s'est produite"}
            </h1>
            <p className="text-neutral-400 mb-6">
              {isCrashLoop
                ? "L'application a rencontré plusieurs erreurs consécutives. Veuillez rafraîchir la page."
                : "L'application a rencontré un problème. Vous pouvez essayer de récupérer ou rafraîchir la page."}
            </p>

            {showReset && !isCrashLoop && (
              <div className="flex gap-3 justify-center mb-4">
                <button
                  onClick={this.handleReset}
                  className="px-6 py-3 bg-primary-500 hover:bg-primary-400 text-white rounded-full font-medium transition-colors"
                >
                  Réessayer
                </button>
                <button
                  onClick={this.handleReload}
                  className="px-6 py-3 bg-neutral-700 hover:bg-neutral-600 text-white rounded-full font-medium transition-colors"
                >
                  Rafraîchir
                </button>
              </div>
            )}

            {isCrashLoop && (
              <button
                onClick={this.handleReload}
                className="px-6 py-3 bg-primary-500 hover:bg-primary-400 text-white rounded-full font-medium transition-colors"
              >
                Rafraîchir la page
              </button>
            )}

            {error && (
              <details className="mt-6 text-left">
                <summary className="text-neutral-500 cursor-pointer hover:text-neutral-400">
                  Détails techniques
                </summary>
                <div className="mt-2 space-y-2">
                  <pre className="p-4 bg-neutral-800 rounded-lg text-xs text-neutral-400 overflow-auto max-h-40">
                    {error.toString()}
                  </pre>
                  {errorInfo && (
                    <pre className="p-4 bg-neutral-800 rounded-lg text-xs text-neutral-500 overflow-auto max-h-40">
                      {errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Higher-order component to wrap components with ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
): React.FC<P> {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * Specialized Error Boundary for the Room component
 * Handles video call specific errors
 */
export class RoomErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false,
      errorCount: 0 
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    console.error("[RoomErrorBoundary] Error in room:", error);
    console.error("[RoomErrorBoundary] Component stack:", errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined 
    });
    this.props.onReset?.();
  };

  handleLeaveRoom = () => {
    window.location.href = '/';
  };

  render() {
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <div className="text-6xl mb-4">📹</div>
            <h1 className="text-2xl font-medium text-white mb-4">
              Problème dans l'appel
            </h1>
            <p className="text-neutral-400 mb-6">
              Une erreur est survenue pendant la visioconférence. 
              Vous pouvez réessayer ou quitter la réunion.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-6 py-3 bg-primary-500 hover:bg-primary-400 text-white rounded-full font-medium transition-colors"
              >
                Réessayer
              </button>
              <button
                onClick={this.handleLeaveRoom}
                className="px-6 py-3 bg-danger-500 hover:bg-danger-400 text-white rounded-full font-medium transition-colors"
              >
                Quitter la réunion
              </button>
            </div>
            {error && (
              <details className="mt-6 text-left">
                <summary className="text-neutral-500 cursor-pointer">
                  Détails techniques
                </summary>
                <pre className="mt-2 p-4 bg-neutral-800 rounded-lg text-xs text-neutral-400 overflow-auto">
                  {error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Specialized Error Boundary for Video components
 * Handles video stream specific errors
 */
export class VideoErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false,
      errorCount: 0 
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    console.error("[VideoErrorBoundary] Video error:", error);
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined 
    });
    this.props.onReset?.();
  };

  render() {
    const { hasError } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="w-full h-full bg-neutral-800 rounded-lg flex items-center justify-center">
          <div className="text-center p-4">
            <div className="text-4xl mb-2">📹</div>
            <p className="text-neutral-400 text-sm">Erreur vidéo</p>
            <button
              onClick={this.handleReset}
              className="mt-2 px-3 py-1 bg-neutral-700 hover:bg-neutral-600 text-white text-xs rounded transition-colors"
            >
              Réessayer
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
