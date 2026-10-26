// Catches crashes and storage failures and explains what to do, instead of a blank screen.

import { Component, type ReactNode } from 'react';
import { exportAll, today } from './data';

function explain(err: Error): { title: string; detail: string } {
  const name = err.name || '';
  if (/MissingAPI|InvalidState|OpenFailed|DatabaseClosed|QuotaExceeded|UnknownError/i.test(`${name} ${err.message}`)) {
    return {
      title: "Can't open your data on this device",
      detail: 'The browser blocked storage. This happens in private or incognito windows, when site data is blocked, or when the phone is out of space. Open the app in a normal window, free some space, then reload.',
    };
  }
  return {
    title: 'Something went wrong on this screen',
    detail: 'Your logged data is stored separately and is most likely safe. Reload to try again. If it keeps happening, export a backup first.',
  };
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  async backup() {
    try {
      const blob = new Blob([await exportAll()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `rep-ledger-backup-${today()}.json`;
      a.click();
    } catch {
      alert('The backup could not be created because storage is unavailable.');
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { title, detail } = explain(error);
    return (
      <div className="main"><div className="page">
        <section className="panel" role="alert">
          <h1 style={{ fontSize: '1.375rem' }}>{title}</h1>
          <p className="muted" style={{ marginTop: 8 }}>{detail}</p>
          <div className="row wrap" style={{ marginTop: 12 }}>
            <button className="primary" onClick={() => location.reload()}>Reload</button>
            <button onClick={() => this.backup()}>Export backup</button>
          </div>
          <details style={{ marginTop: 8 }}><summary>Technical details</summary><p className="small muted"><code>{error.name}: {error.message}</code></p></details>
        </section>
      </div></div>
    );
  }
}
