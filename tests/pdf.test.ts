import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseline, openingBalances, packages } from '../lib/domain/baseline';
import { buildProgressPdf } from '../lib/server/pdf';

await test('professional report is a valid worker-safe PDF using official calculations', () => {
  const bytes = buildProgressPdf({
    packages,
    openingBalances,
    submissions: [],
    settings: baseline,
  }, new Date('2026-09-05T12:00:00.000Z'));
  const content = new TextDecoder().decode(bytes);
  assert.match(content, /^%PDF-1\.7/);
  assert.match(content, /Overall Project Progress/);
  assert.match(content, /14\.45%/);
  assert.match(content, /Trenching & Excavation/);
  assert.doesNotMatch(content, /Ø160 & Ø110/);
  assert.match(content, /Transportation & Delivery/);
  assert.doesNotMatch(content, /Pre-Delivery Inspection/);
  assert.match(content, /Final Testing, Documentation & Handover/);
  assert.match(content, /Block readiness/);
  assert.match(content, /Today's productivity/);
  assert.match(content, /%%EOF$/);
});
