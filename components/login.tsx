'use client';
import { useState } from 'react';
import { TreePine, ArrowRight, LoaderCircle } from 'lucide-react';
import { LoginSlideshow } from './login-slideshow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Workspace } from './workspace';
import type { State } from '@/lib/types';
export function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [workspace, setWorkspace] = useState<State>();
  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || 'Unable to sign in.');
      const snapshotResponse = await fetch('/api/state?view=dashboard', {
        cache: 'no-store',
      });
      const snapshot = (await snapshotResponse.json()) as State & {
        error?: string;
      };
      if (!snapshotResponse.ok)
        throw Error(snapshot.error || 'Unable to load the project.');
      window.history.replaceState({}, '', '/workspace/dashboard');
      setWorkspace(snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to connect.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }
  if (workspace) return <Workspace view="dashboard" initialState={workspace} />;
  return (
    <main className="login-page login-split">
      <div className="login-shell">
      <section className="login-card">
        <div className="brand-mark">
          <TreePine size={30} />
        </div>
        <h1>Tree Translocation Project</h1>
        <p>Sign in to your project workspace.</p>
        <form onSubmit={submit}>
          <label htmlFor="pin">Enter your access PIN</label>
          <Input
            id="pin"
            name="pin"
            className="pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{3}"
            maxLength={3}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="···"
            aria-describedby={error ? 'login-error' : undefined}
          />
          {error && (
            <p id="login-error" className="error" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="primary login-submit"
            disabled={busy || pin.length !== 3}
          >
            {busy ? (
              <LoaderCircle className="spin" />
            ) : (
              <>
                Login <ArrowRight size={17} />
              </>
            )}
          </Button>
        </form>
      </section>
      <LoginSlideshow />
      </div>
    </main>
  );
}
