// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Erreur capturee:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <div className="text-6xl mb-4">:(</div>
            <h1 className="text-2xl font-medium text-white mb-4">
              Une erreur s'est produite
            </h1>
            <p className="text-neutral-400 mb-6">
              L'application a rencontre un probleme. Essayez de rafraichir la page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-primary-500 hover:bg-primary-400 text-white rounded-full font-medium transition-colors"
            >
              Rafraichir
            </button>
            {this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-neutral-500 cursor-pointer">Details techniques</summary>
                <pre className="mt-2 p-4 bg-neutral-800 rounded-lg text-xs text-neutral-400 overflow-auto">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
