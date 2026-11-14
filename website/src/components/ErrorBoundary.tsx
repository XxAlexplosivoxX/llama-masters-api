import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-4 rounded-lg border border-nasa-red/50 bg-nasa-red/10 p-4 text-sm" role="alert">
        <p className="font-semibold">The {this.props.label} stopped working.</p>
        <p className="mt-1 text-muted">{this.state.error.message}</p>
        <button className="btn mt-3" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
