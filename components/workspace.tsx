'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TreePine,
  LayoutDashboard,
  ClipboardCheck,
  CalendarDays,
  Grid2X2,
  Droplets,
  Fence,
  Sprout,
  Trees,
  ShieldCheck,
  ChartNoAxesCombined,
  FileChartColumn,
  UsersRound,
  Settings2,
  History,
  LogOut,
  Search,
  Bell,
  Menu,
  Plus,
  ArrowDownToLine,
  X,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type State, initials, post } from '@/lib/types';
import { Dashboard } from './dashboard';
import { DataPages } from './data-pages';
import { ProgressForm } from './progress-form';
const navigation: {
  group: string;
  items: [string, string, typeof TreePine][];
}[] = [
  {
    group: 'PROJECT',
    items: [
      ['dashboard', 'Dashboard', LayoutDashboard],
      ['approvals', 'Waiting for Approval', ClipboardCheck],
      ['daily', 'Daily Progress', CalendarDays],
      ['blocks', 'Block Readiness', Grid2X2],
      ['irrigation', 'Irrigation', Droplets],
      ['support', 'Support System', Fence],
      ['translocation', 'Tree Translocation', Trees],
      ['new-trees', 'New Trees', Sprout],
      ['quality', 'Quality', ShieldCheck],
    ],
  },
  {
    group: 'MANAGEMENT',
    items: [
      ['schedule', 'Schedule', ChartNoAxesCombined],
      ['reports', 'Reports', FileChartColumn],
      ['supervisors', 'Supervisors', UsersRound],
      ['settings', 'Project Settings', Settings2],
      ['audit', 'Audit Log', History],
    ],
  },
];
export function Workspace({
  view,
  initialState,
  preview = false,
}: {
  view: string;
  initialState?: State;
  preview?: boolean;
}) {
  const [state, setState] = useState<State | undefined>(initialState),
    [error, setError] = useState(''),
    [open, setOpen] = useState(false),
    [adding, setAdding] = useState(false),
    [query, setQuery] = useState('');
  async function refresh() {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (r.status === 401) {
        window.location.assign('/');
        return;
      }
      const d = (await r.json()) as State & { error?: string };
      if (!r.ok) throw Error(d.error);
      setState(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load project.');
    }
  }
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Fetch authenticated state after mount, never during render.
    if (!initialState) void refresh();
  }, [initialState]);
  useEffect(() => {
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!ctx || !state || preview) return;
    const lifecycle = new AbortController();
    const tool = {
      name: 'start_daily_progress',
      title: 'Start daily progress',
      description:
        'Open the daily progress entry form. This does not submit or approve any work.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        if (!input || typeof input !== 'object' || Object.keys(input).length)
          throw Error('Expected an empty object.');
        setAdding(true);
        return { status: 'form_opened', submitted: false };
      },
    };
    try {
      void Promise.resolve(
        ctx.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [state, preview]);
  if (!state)
    return (
      <main className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <TreePine />
            TREE CONTROL
          </div>
        </aside>
        <section className="content">
          <h1>Project Control</h1>
          {error ? (
            <div className="notice section-spacer" role="alert">
              {error}
              <Link href="/">Return to sign in</Link>
            </div>
          ) : (
            <>
              <p className="card-subtitle">Loading your workspace…</p>
              <div className="kpi-grid section-spacer">
                {[1, 2, 3, 4].map((n) => (
                  <div className="skeleton" key={n} />
                ))}
              </div>
              <div className="skeleton" style={{ height: 300 }} />
            </>
          )}
        </section>
      </main>
    );
  const isAdmin = state.user.role === 'ADMIN',
    allowed = isAdmin || ['dashboard', 'daily'].includes(view),
    pending = state.submissions.filter((s) => s.status === 'WAITING').length;
  const title =
    !isAdmin && view === 'dashboard'
      ? 'Site Progress'
      : navigation.flatMap((g) => g.items).find((i) => i[0] === view)?.[1] ||
        'Page not found';
  const href = (v: string) =>
    preview ? `/design-preview?view=${v}` : `/workspace/${v}`;
  return (
    <main className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <a href={href('dashboard')} className="brand">
          <TreePine size={28} />
          <span>TREE CONTROL</span>
        </a>
        {navigation.map((g) => (
          <nav key={g.group} aria-label={g.group}>
            <p className="nav-label">{g.group}</p>
            {g.items
              .filter((i) => isAdmin || ['dashboard', 'daily'].includes(i[0]))
              .map(([id, label, Icon]) => (
                <a
                  className={`nav-link ${view === id ? 'active' : ''}`}
                  aria-current={view === id ? 'page' : undefined}
                  key={id}
                  href={href(id)}
                >
                  <Icon />
                  <span>{label}</span>
                  {id === 'approvals' && pending > 0 && (
                    <span className="nav-count">{pending}</span>
                  )}
                </a>
              ))}
          </nav>
        ))}
        <p className="nav-label">GENERAL</p>
        <button
          className="nav-link"
          disabled={preview}
          onClick={async () => {
            try {
              await post('logout', {});
              window.location.assign('/');
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          <LogOut />
          <span>Logout</span>
        </button>
        <div className="sidebar-foot">
          <div className="site-note">
            <Sprout size={22} />
            <strong>
              Every tree.
              <br />A stronger tomorrow.
            </strong>
            <p>
              Tree Translocation Project
              <br />
              Project Control Dashboard
            </p>
          </div>
        </div>
      </aside>
      <section className="workspace">
        <header className="toolbar">
          <button
            className="icon-button mobile-toggle"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
          <label className="search-wrap">
            <Search />
            <input
              aria-label="Search project data"
              placeholder="Search project data"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>⌕</kbd>
          </label>
          <div className="toolbar-right">
            <a
              className="icon-button"
              aria-label={`${pending} pending approvals`}
              href={href(isAdmin ? 'approvals' : 'daily')}
            >
              <ClipboardCheck />
              {pending > 0 && <i className="dot" />}
            </a>
            <a
              className="icon-button"
              aria-label="View recent activity"
              href={href(isAdmin ? 'audit' : 'daily')}
            >
              <Bell />
              {pending > 0 && <i className="dot" />}
            </a>
            <div className="user-info">
              <span className="avatar">{initials(state.user.name)}</span>
              <div>
                <strong>{state.user.name}</strong>
                <small>{isAdmin ? 'Administrator' : 'Foreman'}</small>
              </div>
            </div>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <h1>{title}</h1>
              <p>
                {view === 'dashboard'
                  ? 'Monitor project progress, productivity and site readiness.'
                  : 'TREE TRANSLOCATION PROJECT / ' + title.toUpperCase()}
              </p>
            </div>
            <div className="heading-actions">
              <Button
                className="primary"
                disabled={preview}
                onClick={() => setAdding(true)}
              >
                <Plus size={15} />
                {isAdmin ? 'Add Progress' : 'Add Daily Progress'}
              </Button>
              {isAdmin && (
                <a href={href('reports')} className="secondary">
                  <ArrowDownToLine size={14} />
                  View Reports
                </a>
              )}
            </div>
          </div>
          {preview && (
            <div className="notice info">
              Design preview · Empty baseline only. No live project data or
              authenticated access. Editing is disabled.
            </div>
          )}
          {state.user.defaultPin && isAdmin && !preview && (
            <div className="notice">
              <ShieldCheck size={16} />
              Default administrator PIN is still active. Change it in Supervisor
              Management before going live.
            </div>
          )}
          {error && (
            <div className="notice" role="alert">
              {error}
              <button onClick={() => setError('')}>Dismiss</button>
            </div>
          )}
          {!allowed ? (
            <div className="card empty-note">
              This page requires administrator access.
            </div>
          ) : query ? (
            <DataPages
              state={state}
              view="search"
              query={query}
              refresh={refresh}
              preview={preview}
            />
          ) : view === 'dashboard' ? (
            <Dashboard state={state} href={href} />
          ) : (
            <DataPages
              state={state}
              view={view}
              query=""
              refresh={refresh}
              preview={preview}
            />
          )}
          <footer
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 22,
              color: '#9ba69f',
              fontSize: 10,
            }}
          >
            <span>Tree Control · Approved work. Clear progress.</span>
            <span>
              Project workspace{' '}
              <ArrowUpRight size={10} style={{ display: 'inline' }} />
            </span>
          </footer>
        </div>
      </section>
      <ProgressForm
        state={state}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={refresh}
      />
    </main>
  );
}
