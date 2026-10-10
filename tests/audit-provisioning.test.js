import test from 'node:test';
import assert from 'node:assert/strict';
import { decisions } from '../src/data/catalog.js';
import { SCENARIO } from '../src/data/scenario.js';
import { auditRecords, filterAuditRecords, isManualFulfillment } from '../src/demo/audit.js';
import { connectedProvisioningRows, connectedChangeSummary, demoReducer as reduce, initialState, restoreState, lifecycleStatus } from '../src/demo/state.js';

const complete = state => reduce(state, { type: 'COMPLETE_LEGACY', reference: '  DBA-VERIFY-0842  ', note: '  Selected write access revoked and verified.  ' });
const decide = (state, rowId, action) => reduce(state, { type: 'DECIDE', rowId, action, comment: 'Required for the approved business scope.' });
const evaluate = () => reduce(initialState(), { type: 'EVALUATE' });
function apply(state = evaluate()) {
  for (const scope of ['human', 'agent']) state = reduce(state, { type: 'ACCEPT_ALL', scope });
  state = reduce(state, { type: 'REVIEW', result: 'approved', note: 'Approved after conflicting access is removed.' });
  return reduce(state, { type: 'APPLY_DECISIONS' });
}
const run = state => reduce(state, { type: 'RUN_FULFILLMENT' });
const ids = rows => rows.map(row => row.id).sort();

test('connected rows include only actionable changes plus lifecycle KEEP entitlements when requested', () => {
  assert.deepEqual(connectedProvisioningRows(initialState(), true), []);
  const applied = apply();
  const before = JSON.stringify(applied);
  const changedIds = ['a-ar', 'a-dashboard', 'h-ar', 'h-budget', 'h-dashboard', 'h-payment', 'h-snow-approver'];
  const keptIds = ['a-bi', 'a-reports', 'h-bi', 'h-sap', 'h-snow-self'];
  for (const state of [applied, run(applied)]) {
    assert.deepEqual(ids(connectedProvisioningRows(state)), changedIds);
    assert.deepEqual(ids(connectedProvisioningRows(state, true)), [...changedIds, ...keptIds].sort());
    const summary = connectedChangeSummary(state);
    connectedProvisioningRows(state, true);
    assert.deepEqual(connectedChangeSummary(state), summary);
    assert.equal(summary.total, 7);
    assert.equal(summary.completed, state.fulfillmentStarted ? 7 : 0);
    for (const row of connectedProvisioningRows(state, true)) assert.ok(decisions.includes(row));
  }
  assert.equal(JSON.stringify(applied), before);
});

test('withheld grants, policy locks and manual access stay out of connected rows while overrides follow the saved decisions', () => {
  let state = decide(evaluate(), 'h-budget', 'DO_NOT_GRANT');
  state = decide(state, 'h-bi', 'REMOVE');
  state = run(apply(state));
  for (const includeUnchanged of [false, true]) {
    const rows = connectedProvisioningRows(state, includeUnchanged);
    assert.ok(rows.some(row => row.id === 'h-bi'));
    for (const id of ['h-budget', 'a-payment', 'h-legacy', 'a-legacy', 'a-inbound']) assert.ok(!rows.some(row => row.id === id));
    assert.deepEqual(connectedChangeSummary(state), { total: 7, completed: 7 });
  }
  const usageRemoved = run(apply(decide(evaluate(), 'a-inbound', 'REMOVE')));
  assert.ok(connectedProvisioningRows(usageRemoved).some(row => row.id === 'a-inbound'));
  assert.deepEqual(connectedChangeSummary(usageRemoved), { total: 8, completed: 8 });
});

test('manual initiation and completion record separate task-level actor/action/results without replacing either governance or access-removal evidence', () => {
  const open = run(apply());
  const completed = complete(open);
  assert.equal(open.manualFulfillmentEvidence.length, 1);
  assert.equal(open.manualFulfillmentEvidence[0].result, 'Open');
  assert.equal(open.manualFulfillmentEvidence[0].timestamp, SCENARIO.fulfillmentAt);
  assert.deepEqual(completed.manualFulfillmentEvidence[0], open.manualFulfillmentEvidence[0]);
  assert.equal(completed.manualFulfillmentEvidence.length, 2);
  assert.deepEqual(completed.manualFulfillmentEvidence[1], {
    id: 'MF-SN-TASK-004812-completed', eventId: 'WD-MOV-2026-0842', category: 'Controlled task', eventType: 'Manual fulfillment', stage: 'completed',
    owner: 'Martin Keller', method: 'Controlled manual task', due: SCENARIO.legacyDue, dueAt: SCENARIO.legacyDueAt,
    completedBy: 'Martin Keller', verifiedBy: 'Patrick Sena', summary: 'Completed by Martin Keller, verified by Patrick Sena',
    changeReference: null, verificationReference: 'DBA-VERIFY-0842',
    actor: 'Martin Keller', action: 'Completed manual access removal', applicationId: 'legacy', application: 'Legacy Finance DB', target: 'Legacy Finance DB Write',
    entitlement: 'legacy-write', resource: 'Legacy Finance DB Write', task: 'SN-TASK-004812', result: 'Completed within SLA',
    timestamp: completed.legacyTask.completedAt, reference: 'DBA-VERIFY-0842', note: 'Selected write access revoked and verified.',
    rowIds: ['h-legacy', 'a-legacy'],
  });
  assert.equal(completed.manualFulfillmentEvidence[0].timestamp.slice(0, 10), SCENARIO.effectiveDateISO);
  assert.deepEqual(completed.decisionEvidence, open.decisionEvidence);
  for (const id of ['h-legacy', 'a-legacy']) {
    assert.equal(completed.decisionEvidence.filter(record => record.rowId === id).at(-1).decidedBy, 'Patrick Sena · Head of Identity Governance');
    assert.equal(completed.tasks[id].status, 'Removed');
    assert.equal(completed.fulfillmentEvidence.filter(record => record.rowId === id).at(-1).task, 'SN-TASK-004812');
  }
  assert.equal(lifecycleStatus(completed), 'Completed');
  assert.equal(complete(completed), completed);
  // Older saved sessions reconstruct the new evidence through existing action replay.
  const oldSaved = { ...completed };
  delete oldSaved.manualFulfillmentEvidence;
  assert.deepEqual(restoreState({ getItem: () => JSON.stringify(oldSaved) }), completed);
  assert.deepEqual(reduce(completed, { type: 'RESET' }).manualFulfillmentEvidence, []);
});

test('audit All and Manual tasks include the dedicated completion record exactly once with dynamic history counts', () => {
  const open = run(apply());
  const completed = complete(open);
  for (const type of ['decision', 'provisioning']) {
    assert.equal(auditRecords(open, type).length, 17);
    const records = auditRecords(completed, type);
    assert.equal(records.length, 18);
    assert.equal(records.filter(isManualFulfillment).length, 2);
    assert.equal(filterAuditRecords(records, completed, type, 'all').length, 18);
    assert.equal(filterAuditRecords(records, completed, type, 'key').length, 5);
    assert.equal(filterAuditRecords(records, completed, type, 'locked').length, 1);
    assert.equal(filterAuditRecords(records, completed, type, 'overrides').length, 0);
    const manual = filterAuditRecords(records, completed, type, 'manual');
    assert.equal(manual.length, 4);
    assert.equal(manual.filter(isManualFulfillment).length, 2);
    const full = auditRecords(completed, type, true);
    assert.equal(full.length, (type === 'decision' ? completed.decisionEvidence : completed.fulfillmentEvidence).length + 2);
    assert.equal(full.filter(isManualFulfillment).length, 2);
  }
});

test('manual evidence reflects the selected removal scope and is absent when no controlled task is required', () => {
  for (const keptId of ['h-legacy', 'a-legacy']) {
    const completed = complete(run(apply(decide(evaluate(), keptId, 'KEEP'))));
    assert.equal(completed.manualFulfillmentEvidence.length, 2);
    assert.deepEqual(completed.manualFulfillmentEvidence[0].rowIds, [keptId === 'h-legacy' ? 'a-legacy' : 'h-legacy']);
    assert.equal(filterAuditRecords(auditRecords(completed), completed, 'decision', 'manual').length, 3);
  }
  const noTask = run(apply(decide(decide(evaluate(), 'h-legacy', 'KEEP'), 'a-legacy', 'KEEP')));
  assert.equal(complete(noTask), noTask);
  assert.deepEqual(noTask.manualFulfillmentEvidence, []);
  assert.equal(auditRecords(noTask).length, 16);
  assert.equal(filterAuditRecords(auditRecords(noTask), noTask, 'decision', 'manual').length, 0);
});
