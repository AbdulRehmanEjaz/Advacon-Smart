import { spawn } from 'node:child_process';
import { emitKeypressEvents } from 'node:readline';
import { fileURLToPath } from 'node:url';

// Run locally, never import this module from a Worker route. Inputs stay in
// process memory: no shell command history, .env writes or public endpoints.
async function privateInput(label: string): Promise<string> {
  if (!process.stdin.isTTY)
    throw Error(
      'Use an interactive local terminal, or set private environment variables.',
    );
  process.stdout.write(`${label} (hidden): `);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    function finish() {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    }
    function onKey(text: string, key: { name?: string; ctrl?: boolean }) {
      if (key.ctrl && key.name === 'c') {
        finish();
        reject(Error('Cancelled.'));
      } else if (key.name === 'return' || key.name === 'enter') {
        finish();
        resolve(value);
      } else if (key.name === 'backspace') value = value.slice(0, -1);
      else if (text && !key.ctrl && !text.includes('\u001b'))
        value += text.replace(/[\r\n]/g, '');
    }
    process.stdin.on('keypress', onKey);
  });
}

async function run(args: string[], env: NodeJS.ProcessEnv) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', () =>
      reject(Error('Unable to start database tooling.')),
    );
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(Error('Database command failed; later steps were not run.')),
    );
  });
}

try {
  const setup = process.argv[2] === 'setup';
  if (!setup && process.argv[2] !== 'migrate')
    throw Error('Choose setup or migrate.');
  console.log(
    setup
      ? 'One-time database initialization: applies migrations and creates/resets only the two initial accounts. Existing project progress is preserved. Run migrate (not setup) for later schema-only upgrades.'
      : 'Apply committed migrations only. Accounts and project progress are not reset.',
  );
  const direct =
    process.env.DIRECT_DATABASE_URL ||
    (await privateInput('Prisma Postgres DIRECT connection URL (not pooled)'));
  let parsed: URL;
  try {
    parsed = new URL(direct);
  } catch {
    throw Error('Invalid PostgreSQL URL.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.hostname.startsWith('pooled.')
  )
    throw Error(
      'Use the direct PostgreSQL URL from Prisma Connect, not the pooled runtime URL.',
    );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: direct,
    DIRECT_DATABASE_URL: direct,
  };
  if (setup) {
    env.SESSION_SECRET =
      process.env.SESSION_SECRET ||
      (await privateInput(
        'Exact SESSION_SECRET already used by your live Worker',
      ));
    env.INITIAL_ADMIN_PIN =
      process.env.INITIAL_ADMIN_PIN ||
      (await privateInput('Initial Administrator PIN'));
    env.INITIAL_FOREMAN_PIN =
      process.env.INITIAL_FOREMAN_PIN ||
      (await privateInput('Initial Supervisor PIN'));
    if (
      env.SESSION_SECRET.length < 32 ||
      !/^\d{3}$/.test(env.INITIAL_ADMIN_PIN) ||
      !/^\d{3}$/.test(env.INITIAL_FOREMAN_PIN) ||
      env.INITIAL_ADMIN_PIN === env.INITIAL_FOREMAN_PIN
    )
      throw Error(
        'A secret of at least 32 characters and distinct three-digit PINs are required. Nothing was changed.',
      );
  }
  const prismaCli = fileURLToPath(
    new URL('../node_modules/prisma/build/index.js', import.meta.url),
  );
  await run([prismaCli, 'migrate', 'deploy'], env);
  if (setup) {
    await run([prismaCli, 'generate'], env);
    await run(
      [
        '--import',
        'tsx',
        fileURLToPath(new URL('../prisma/seed.ts', import.meta.url)),
      ],
      env,
    );
  }
  console.log(
    'Database command completed. No secret values were saved to disk.',
  );
} catch (e) {
  console.error(
    e instanceof Error ? e.message : 'Database initialization failed.',
  );
  process.exitCode = 1;
}
