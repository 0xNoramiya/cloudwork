import { Component, type ReactNode } from 'react'

interface Props {
  area: string
  children: ReactNode
}

/** Keeps a crash in one layer (world or HUD) from blanking the whole app, and says what happened. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.area}]`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="scrim" style={{ background: 'transparent', backdropFilter: 'none', pointerEvents: 'none' }}>
        <div className="panel" role="alert" style={{ padding: 18, maxWidth: 440, pointerEvents: 'auto' }}>
          <h2 className="panel-title">The {this.props.area} hit a snag</h2>
          <p className="small" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>
            {this.state.error.message}. Your projects and memories are saved; reloading usually fixes this.
          </p>
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button className="btn btn-sm" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
