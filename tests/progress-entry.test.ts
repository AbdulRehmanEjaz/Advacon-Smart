import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packages } from '../lib/domain/baseline';
import { progressRequiresBlock, supplyProgressEntry, treeProgressEntry } from '../lib/domain/progress-entry';

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
  for (const pkg of packages.filter((item) => !['translocation', 'new-trees'].includes(item.id))) {
    assert.equal(progressRequiresBlock('ADMIN', pkg.id, items(pkg.activities)), false);
  }
});

await test('supply process types show the exact activity pairs and only offload/inspection requires a block', () => {
  const activities = packages.find((pkg) => pkg.id === 'new-trees')!.activities;
  const selection = activities.filter((item) => supplyProgressEntry(item.id) === 'selection-transport');
  const offload = activities.filter((item) => supplyProgressEntry(item.id) === 'offload-inspection');
  assert.deepEqual(selection.map((item) => item.name), ['Tree Selection', 'Transportation & Delivery']);
  assert.deepEqual(offload.map((item) => item.name), ['Off-Loading', 'Inspection, Counting & Handover']);
  for (const role of ['ADMIN', 'FOREMAN']) {
    const items = (entries: typeof activities) => entries.map((item) => ({ activityId: item.id }));
    assert.equal(progressRequiresBlock(role, 'new-trees', items(selection)), false);
    assert.equal(progressRequiresBlock(role, 'new-trees', items(offload)), true);
    assert.equal(progressRequiresBlock(role, 'new-trees', items(activities)), true);
    for (const activity of offload) {
      assert.equal(progressRequiresBlock(role, 'new-trees', [{ activityId: activity.id }]), true);
    }
  }
});
