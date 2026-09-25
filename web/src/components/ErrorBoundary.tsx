import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/*
 * One failing section degrades to a note instead of blanking the page. Every section here
 * runs real query code over the committed slice, so a template that stops rendering or a
 * slice that no longer carries an entity a section names is a visible, local failure.
 */

interface Props {
  section: string;
  children: ReactNode;
}

interface State {
  message: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { message: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Keep the detail in the console: the page states the failure, the console locates it.
    console.error(`section ${this.props.section} failed`, error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <section className="section">
        <div className="shell">
          <p className="eyebrow">{`${this.props.section} / unavailable`}</p>
          <p className="section__lede">
            This section could not be rendered from the committed slice.
          </p>
          <pre style={{ marginTop: 12 }}>{this.state.message}</pre>
        </div>
      </section>
    );
  }
}
