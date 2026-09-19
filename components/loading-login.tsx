'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { LoginSlideshow } from './login-slideshow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoadingLogin() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/loading-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || 'Unable to sign in.');
      router.replace('/loading');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to connect.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page login-split">
      <div className="login-shell">
        <div className="login-panel">
          <section className="login-card">
            <Image className="login-project-logo" src="/images/advacon-logo.png" alt="ADVACON" width={784} height={196} unoptimized priority />
            <h1>Tree Translocation Loading</h1>
            <p>Loading Supervisor sign in.</p>
            <form onSubmit={submit}>
              <label htmlFor="loading-pin">Enter your access PIN</label>
              <div className="pin-control">
                <Input
                  id="loading-pin"
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
                  aria-describedby={error ? 'loading-pin-hint loading-error' : 'loading-pin-hint'}
                  aria-invalid={error ? true : undefined}
                />
                <div className="pin-indicators" aria-hidden="true">
                  {[0, 1, 2].map((position) => (
                    <span key={position} className="pin-indicator" data-filled={position < pin.length} />
                  ))}
                </div>
              </div>
              <span id="loading-pin-hint" className="sr-only">Enter your three-digit PIN.</span>
              {error && (
                <p id="loading-error" className="error" role="alert">
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
          <footer className="login-company-footer">©Advanced Concepts Contracting Co. Ltd.</footer>
        </div>
        <LoginSlideshow />
      </div>
    </main>
  );
}
