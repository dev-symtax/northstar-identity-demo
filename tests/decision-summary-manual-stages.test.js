import test from 'node:test';
import assert from 'node:assert/strict';
import { decisions } from '../src/data/catalog.js';
import { SCENARIO } from '../src/data/scenario.js';
import { auditRecords, filterAuditRecords } from '../src/demo/audit.js';
import { demoReducer as reduce, decisionSummary, initialState, restoreState } from '../src/demo/state.js';

const evaluated = () => reduce(initialState(), { type: 'EVALUATE' });
const choose = (state, rowId, action) => reduce(state, { type: 'DECIDE', rowId, action, comment: 'Manually reviewed scope.' });
const summary = (state, scope) => decisionSummary(state, { scope, includeUndecided: true });
function applied(state = evaluated()) {
  for (const scope of ['human', 'agent']) state = reduce(state, { type: 'ACCEPT_ALL', scope });
  state = reduce(state, { type: 'REVIEW', result: 'approved', note: 'SoD removal verified before grant.' });
  return reduce(state, { type: 'APPLY_DECISIONS' });
}
const replay = state => restoreState({ getItem: () => JSON.stringify(state) });

for (const [scope, prefix, initialCounts] of [
  ['human', 'h', { KEEP: 3, GRANT: 3, REMOVE: 2, REVIEW: 1, NOT_PERMITTED: 0, DO_NOT_GRANT: 0 }],
  ['agent', 'a', { KEEP: 3, GRANT: 1, REMOVE: 2, REVIEW: 0, NOT_PERMITTED: 1, DO_NOT_GRANT: 0 }],
]) test(`${scope} effective summary follows overrides, acceptance, policy locks, replay and reset`, () => {
  let state = evaluated();
  assert.deepEqual(summary(state, scope).byAction, initialCounts);
  const locked = state.accessDecisions['a-payment'];
  state = choose(state, `${prefix}-bi`, 'REMOVE');
  state = choose(state, `${prefix}-dashboard`, 'DO_NOT_GRANT');
  const expected = { ...initialCounts, KEEP: initialCounts.KEEP - 1, GRANT: initialCounts.GRANT - 1,
    REMOVE: initialCounts.REMOVE + 1, DO_NOT_GRANT: 1 };
  assert.deepEqual(summary(state, scope).byAction, expected);
  assert.equal(Object.values(summary(state, scope).byAction).reduce((sum, count) => sum + count), scope === 'human' ? 9 : 7);
  state = reduce(state, { type: 'ACCEPT_ALL', scope });
  assert.deepEqual(summary(state, scope).byAction, expected);
  assert.equal(state.accessDecisions[`${prefix}-dashboard`].comment, 'Manually reviewed scope.');
  assert.deepEqual(state.accessDecisions['a-payment'], locked);
  assert.deepEqual(summary(replay(state), scope), summary(state, scope));
  const ready = applied(state);
  assert.deepEqual(summary(ready).byAction, decisionSummary(ready).byAction);
  for (const action of Object.keys(expected)) {
    assert.equal(summary(ready).byAction[action], summary(ready, 'human').byAction[action] + summary(ready, 'agent').byAction[action]);
  }
  assert.deepEqual(summary(reduce(ready, { type: 'RESET' }), scope).byAction, initialCounts);
});

test('manual obligations exist on apply and remain immutable through deterministic initiation, completion and replay', () => {
  const scheduled = applied();
  const obligations = scheduled.decisionEvidence.filter(record => record.manualFulfillment);
  assert.equal(obligations.length, 2);
  for (const record of obligations) {
    const row = decisions.find(item => item.id === record.rowId);
    assert.equal(record.decidedAction, 'REMOVE');
    assert.equal(record.why, row.reason);
    assert.equal(record.policy, row.policyId);
    assert.equal(record.timestamp, SCENARIO.approvalAt);
    assert.deepEqual(record.manualFulfillment, {
      method: 'Controlled manual task', owner: 'Martin Keller', task: 'SN-TASK-004812',
      application: 'Legacy Finance DB', target: 'Legacy Finance DB Write',
      due: '19 October 2026 · 12:00 UTC', dueAt: SCENARIO.legacyDueAt, status: 'Scheduled',
    });
  }
  assert.deepEqual(scheduled.fulfillmentEvidence, []);
  assert.deepEqual(scheduled.manualFulfillmentEvidence, []);
  assert.equal(filterAuditRecords(auditRecords(scheduled), scheduled, 'decision', 'manual').length, 2);
  const open = reduce(scheduled, { type: 'RUN_FULFILLMENT' });
  const initiation = open.manualFulfillmentEvidence[0];
  assert.equal(initiation.eventType, 'Manual fulfillment');
  assert.equal(initiation.target, 'Legacy Finance DB Write');
  assert.equal(initiation.application, 'Legacy Finance DB');
  assert.equal(initiation.result, 'Open');
  assert.equal(initiation.timestamp, SCENARIO.fulfillmentAt);
  assert.equal(Date.parse(initiation.dueAt) - Date.parse(initiation.timestamp), 4 * 60 * 60 * 1000);
  assert.deepEqual(open.decisionEvidence, scheduled.decisionEvidence);
  for (const id of ['h-legacy', 'a-legacy']) assert.equal(open.tasks[id].status, 'Task open');
  const completed = reduce(open, { type: 'COMPLETE_LEGACY', reference: 'CHG-2026-1042 / DBA-VERIFY-0842', note: 'Both removals verified.' });
  const completion = completed.manualFulfillmentEvidence[1];
  assert.equal(completion.completedBy, 'Martin Keller');
  assert.equal(completion.verifiedBy, 'Patrick Sena');
  assert.equal(completion.changeReference, 'CHG-2026-1042');
  assert.equal(completion.verificationReference, 'DBA-VERIFY-0842');
  assert.equal(completion.timestamp, '2026-10-19T11:42:00.000Z');
  assert.equal(completion.result, 'Completed within SLA');
  assert.equal(completion.summary, 'Completed by Martin Keller, verified by Patrick Sena');
  assert.deepEqual(completed.manualFulfillmentEvidence[0], initiation);
  assert.deepEqual(completed.decisionEvidence, scheduled.decisionEvidence);
  for (const state of [scheduled, open, completed]) assert.deepEqual(replay(state), state);
  assert.deepEqual(reduce(completed, { type: 'RESET' }), initialState());
});

test('manual obligations cover only selected removals and never imply manual work for retained access', () => {
  const one = applied(choose(evaluated(), 'h-legacy', 'KEEP'));
  assert.deepEqual(one.decisionEvidence.filter(record => record.manualFulfillment).map(record => record.rowId), ['a-legacy']);
  const none = applied(choose(choose(evaluated(), 'h-legacy', 'KEEP'), 'a-legacy', 'KEEP'));
  assert.equal(none.decisionEvidence.filter(record => record.manualFulfillment).length, 0);
  assert.equal(reduce(none, { type: 'RUN_FULFILLMENT' }).manualFulfillmentEvidence.length, 0);
});
