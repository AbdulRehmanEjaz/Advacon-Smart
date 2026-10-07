import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packages } from '../lib/domain/baseline';
import { progressRequiresBlock, treeProgressEntry } from '../lib/domain/progress-entry';

await test('Admin translocation entries omit blocks, while placement still requires one', () => {
  const activities = packages.find((pkg) => pkg.id === 'translocation')!.activities;
  const translocation = activities.filter((item) => treeProgressEntry(item.id) === 'translocation');
  const placement = activities.filter((item) => treeProgressEntry(item.id) === 'placement');
  assert.deepEqual(translocation.map((item) => item.name), ['Tree Preparation', 'Loading Activities', 'Transportation']);
  assert.deepEqual(placement.map((item) => item.name), ['Off-Loading & Placement', 'Immediate Irrigation & Final Arrangement']);
  const items = (entries: typeof activities) => entries.map((item) => ({ activityId: item.id }));
  assert.equal(progressRequiresBlock('ADMIN', 'translocation', items(translocation)), false);
  assert.equal(progressRequiresBlock('ADMIN', 'translocation', items(placement)), true);
  assert.equal(progressRequiresBlock('ADMIN', 'translocation', items(activities)), true);
  assert.equal(progressRequiresBlock('FOREMAN', 'translocation', items(translocation)), true);
  assert.equal(progressRequiresBlock('ADMIN', 'new-trees', []), true);
  for (const pkg of packages.filter((item) => !['translocation', 'new-trees'].includes(item.id))) {
    assert.equal(progressRequiresBlock('ADMIN', pkg.id, items(pkg.activities)), false);
  }
});
