import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { baselineSql } from '../lib/server/d1-baseline';

const mode = process.argv.includes('--remote') ? '--remote' : '--local';
const output = resolve('.d1-baseline.sql');

try {
  await writeFile(output, baselineSql(), { flag: 'wx' });
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        resolve('node_modules/wrangler/bin/wrangler.js'),
        'd1',
        'execute',
        'DB',
        mode,
        '--file',
        output,
        '--config',
        'dist/server/wrangler.json',
        '--yes',
      ],
      { stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`D1 baseline command exited with ${code}`)),
    );
  });
  console.log('D1 baseline initialized without changing operational records.');
} finally {
  await unlink(output).catch(() => {});
}
