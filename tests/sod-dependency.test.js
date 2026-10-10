import test from 'node:test';
import assert from 'node:assert/strict';
import { decisions } from '../src/data/catalog.js';
import { REVIEWER } from '../src/data/scenario.js';
import { initialState, demoReducer, getAccessDecision, canApplyDecisions, sodDependency, paymentActivationAllowed, restoreState, humanAccess } from '../src/demo/state.js';

const choice = (state, id) => getAccessDecision(decisions.find(row => row.id === id), state);
const act = (state, type, extra = {}) => demoReducer(state, { type, ...extra });
const start = () => act(initialState(), 'EVALUATE');
const review = (state, result = 'approved') => act(state, 'REVIEW', { result, note: 'Payment authorization reviewed by Patrick.' });
const keep = state => act(state, 'DECIDE', { rowId: 'h-ar', action: 'KEEP', comment: 'Month-end responsibility retained.', decisionSource: 'manual-override' });
const accept = state => act(act(state, 'ACCEPT_ALL', { scope: 'human' }), 'ACCEPT_ALL', { scope: 'agent' });
const replay = state => restoreState({ getItem: () => JSON.stringify(state) });

test('approval first records mandatory removal, preserves actual access and protects it from individual and bulk overrides', () => {
  const approved = review(start());
  assert.deepEqual(sodDependency(approved), { required: true, conflict: false });
  assert.equal(choice(approved, 'h-ar').decidedAction, 'REMOVE');
  assert.equal(choice(approved, 'h-ar').decisionSource, 'policy-required');
  assert.deepEqual(approved.tasks, {});
  assert.deepEqual(approved.fulfillmentEvidence, []);
  assert.ok(humanAccess(approved).some(row => row.id === 'h-ar'));
  assert.equal(keep(approved), approved);
  const bulk = accept(approved);
  assert.deepEqual(choice(bulk, 'h-ar'), choice(approved, 'h-ar'));
  assert.deepEqual(choice(bulk, 'h-payment'), choice(approved, 'h-payment'));
  assert.equal(canApplyDecisions(bulk), true);
  assert.deepEqual(replay(bulk), bulk);
});

test('keeping receivables first survives bulk acceptance and blocks direct review until explicitly resolved', () => {
  const kept = keep(start());
  const bulk = accept(kept);
  assert.deepEqual(choice(bulk, 'h-ar'), choice(kept, 'h-ar'));
  assert.equal(review(bulk), bulk);
  assert.equal(canApplyDecisions(bulk), false);
  assert.equal(act(bulk, 'APPLY_DECISIONS'), bulk);
  const removed = act(bulk, 'RESOLVE_SOD', { resolution: 'remove-ar', comment: 'Remove receivables before activating payment approval.' });
  const approved = review(removed);
  const otherOrder = accept(review(start()));
  assert.deepEqual(decisions.map(row => choice(approved, row.id).decidedAction), decisions.map(row => choice(otherOrder, row.id).decidedAction));
  assert.deepEqual(sodDependency(approved), sodDependency(otherOrder));
  assert.deepEqual(replay(approved), approved);
});

test('denial releases automatic policy removal and preserves independently chosen removals and their rationale', () => {
  const released = review(review(start()), 'rejected');
  assert.deepEqual(sodDependency(released), { required: false, conflict: false });
  assert.equal(choice(released, 'h-ar').decidedAction, null);
  assert.equal(choice(released, 'h-ar').recommendedAction, 'REMOVE');
  assert.equal(choice(released, 'h-ar').decisionSource, 'undecided');
  assert.equal(choice(keep(released), 'h-ar').decidedAction, 'KEEP');
  const manual = act(start(), 'DECIDE', { rowId: 'h-ar', action: 'REMOVE', comment: 'Operational duties end with the role change.', decisionSource: 'manual-override' });
  const denied = review(review(manual), 'rejected');
  assert.equal(choice(denied, 'h-ar').decidedAction, 'REMOVE');
  assert.equal(choice(denied, 'h-ar').comment, choice(manual, 'h-ar').comment);
  assert.equal(choice(denied, 'h-ar').sod.required, false);
  const keptFirst = keep(start());
  const deniedFirst = review(keptFirst, 'rejected');
  assert.deepEqual(choice(deniedFirst, 'h-ar'), choice(keptFirst, 'h-ar'));
  assert.deepEqual(replay(deniedFirst), deniedFirst);
});

test('full-set validation blocks apply and execution of an invalid or incomplete decision set even if supplied directly', () => {
  const approved = accept(review(start()));
  for (const decidedAction of ['KEEP', null]) {
    const invalid = { ...approved, accessDecisions: { ...approved.accessDecisions, 'h-ar': { ...choice(approved, 'h-ar'), decidedAction } } };
    assert.equal(sodDependency(invalid).conflict, true);
    assert.equal(canApplyDecisions(invalid), false);
    assert.equal(act(invalid, 'APPLY_DECISIONS'), invalid);
    const forgedApplied = { ...invalid, applied: true };
    assert.equal(act(forgedApplied, 'RUN_FULFILLMENT'), forgedApplied);
  }
  const saved = JSON.parse(JSON.stringify(approved));
  saved.accessDecisions['h-ar'].decidedAction = 'KEEP';
  assert.equal(choice(replay(saved), 'h-ar').decidedAction, 'REMOVE');
  saved.actions.push({ type: 'DECIDE', rowId: 'h-ar', action: 'KEEP', comment: 'Attempted bypass.' });
  assert.deepEqual(replay(saved), initialState());
});

test('activation requires successful removal and execution evidence links the earlier completion reference', () => {
  for (const status of [undefined, 'Scheduled', 'Task open', 'Failed', 'Retained']) {
    assert.equal(paymentActivationAllowed(status ? { 'h-ar': { status } } : {}), false);
  }
  const approved = accept(review(start()));
  const applied = act(approved, 'APPLY_DECISIONS');
  assert.deepEqual(applied.fulfillmentEvidence, []);
  const executed = act(applied, 'RUN_FULFILLMENT');
  const removal = executed.fulfillmentEvidence.find(record => record.rowId === 'h-ar');
  const payment = executed.fulfillmentEvidence.find(record => record.rowId === 'h-payment');
  assert.equal(removal.status, 'Removed');
  assert.equal(payment.status, 'Granted');
  assert.ok(removal.timestamp < payment.timestamp);
  assert.deepEqual(payment.dependency, { policyId: 'POL-SOD-017', rowId: 'h-ar', status: 'Removed', completionReference: removal.reference });
  assert.deepEqual(executed.decisionEvidence, applied.decisionEvidence);
  assert.deepEqual(replay(executed), executed);
});

test('immutable decision audit captures reviewer, both policies, conflict and final resolution; reset clears the dependency', () => {
  const approved = review(start());
  const approval = approved.decisionEvidence.findLast(record => record.rowId === 'h-payment');
  assert.equal(approval.policyId, 'POL-RISK-204');
  assert.equal(approval.actor, `${REVIEWER.name} · ${REVIEWER.role}`);
  assert.equal(approval.sod.policyId, 'POL-SOD-017');
  assert.equal(approval.sod.conflictingEntitlement, 'Accounts Receivable Operator');
  assert.equal(approval.sod.summary, 'SAP Payment Approval approved conditionally. Accounts Receivable Operator removal required by POL-SOD-017 before activation.');
  const denied = act(approved, 'RESOLVE_SOD', { resolution: 'deny-payment', comment: 'Retain receivables; payment stays with Treasury.' });
  assert.equal(denied.decisionEvidence.findLast(record => record.rowId === 'h-payment').sod.summary, 'SAP Payment Approval denied. POL-SOD-017 conflict resolved; Accounts Receivable Operator may remain active.');
  assert.deepEqual(denied.decisionEvidence.find(record => record.id === approval.id), approval);
  assert.equal(choice(denied, 'h-ar').decidedAction, 'KEEP');
  assert.equal(choice(denied, 'a-payment').decidedAction, 'NOT_PERMITTED');
  assert.deepEqual(replay(denied), denied);
  const reset = act(denied, 'RESET');
  assert.deepEqual(reset, initialState());
  assert.deepEqual(sodDependency(reset), { required: false, conflict: false });
});

test('pre-dependency version 3 sessions replay approval-first individual, bulk and resolution removal choices without losing progress', () => {
  for (const removal of [
    { type: 'DECIDE', rowId: 'h-ar', action: 'REMOVE', comment: '', decisionSource: 'accepted-recommendation' },
    { type: 'ACCEPT_ALL', scope: 'human' },
    { type: 'RESOLVE_SOD', resolution: 'remove-ar', comment: '' },
  ]) {
    const actions = [{ type: 'EVALUATE' },
      ...decisions.filter(row => row.scope === 'human' && !['h-ar', 'h-payment'].includes(row.id)).map(row => ({ type: 'DECIDE', rowId: row.id, action: row.recommendedAction, comment: '' })),
      { type: 'REVIEW', result: 'approved', note: 'Payment authorization reviewed by Patrick.' }, removal,
      { type: 'ACCEPT_ALL', scope: 'agent' }, { type: 'APPLY_DECISIONS' }, { type: 'RUN_FULFILLMENT' },
      { type: 'COMPLETE_LEGACY', reference: 'DBA-VERIFY-0842', note: 'Legacy removals verified.' }];
    const migrated = replay({ version: 3, actions });
    assert.equal(migrated.version, 4);
    assert.equal(migrated.applied, true);
    assert.equal(migrated.legacyTask.status, 'Completed');
    assert.equal(migrated.tasks['h-payment'].status, 'Granted');
    assert.deepEqual(sodDependency(migrated), { required: true, conflict: false });
    assert.deepEqual(replay(migrated), migrated);
  }
});
