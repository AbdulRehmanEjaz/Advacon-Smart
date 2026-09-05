import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await test('sidebar contract removes Quality and adds instant placeholder modules', async () => {
  const source = await readFile(new URL('../components/workspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\['quality',\s*'Quality'/);
  assert.match(source, /\['cost-control', 'Cost Control'/);
  assert.match(source, /\['timesheet', 'Timesheet'/);
});

await test('new progress form has no active batch or photo controls', async () => {
  const source = await readFile(new URL('../components/progress-form.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /batchNumber|type="file"|uploadPhoto/);
  assert.match(source, /Site Supervisors can submit today only/);
  assert.match(source, /kpi-final-handover/);
});
