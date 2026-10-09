import test from 'node:test';
import assert from 'node:assert/strict';
import { decisions, identities, applications, entitlements, agents, policies } from '../src/data/catalog.js';
import { initialState, demoReducer as reduce, humanAccess, agentAccess, readiness, controlComplete, restoreState, STORAGE_KEY } from '../src/demo/state.js';

const evaluate = state => reduce(state, { type: 'EVALUATE' });
const approve = state => reduce(state, { type: 'REVIEW', result: 'approved', note: 'Approved with removal of incompatible receivables access.' });
const deny = state => reduce(state, { type: 'REVIEW', result: 'rejected', note: 'Payment approval remains with the Treasury team.' });
const run = state => reduce(state, { type: 'RUN_FULFILLMENT' });
const complete = state => reduce(state, { type: 'COMPLETE_LEGACY', reference: 'DBA-VERIFY-0842', note: 'Direct and delegated write revoked and verified.' });
const restore = state => restoreState({ getItem: () => JSON.stringify(state) });

test('enterprise cohort has complete, unique, valid relationships', () => {
  assert.equal(identities.length, 48); assert.equal(applications.length, 12); assert.equal(entitlements.length, 40); assert.equal(agents.length, 4);
  for (const dataset of [identities, applications, entitlements, agents, decisions, policies]) assert.equal(new Set(dataset.map(i => i.id)).size, dataset.length);
  for (const identity of identities) for (const id of identity.access) assert.ok(entitlements.some(e => e.id === id));
  for (const entitlement of entitlements) assert.ok(applications.some(a => a.id === entitlement.app));
  for (const decision of decisions) { assert.ok(policies.some(p => p.id === decision.policy)); if (decision.entitlement) assert.ok(entitlements.some(e => e.id === decision.entitlement)); }
});
test('execution and approvals cannot bypass evaluation', () => {
  const start = initialState();
  assert.equal(run(start), start); assert.equal(approve(start), start); assert.equal(complete(start), start);
  assert.equal(humanAccess(start).length, 4); assert.equal(agentAccess(start).length, 4); assert.equal(readiness(start), false);
});
test('evaluation creates decision evidence without execution evidence or changed access', () => {
  const state = evaluate(initialState());
  assert.equal(state.decisionEvidence.length, decisions.length); assert.equal(state.fulfillmentEvidence.length, 0);
  assert.equal(humanAccess(state).length, 4); assert.equal(state.fulfillmentStarted, false);
  for (const record of state.decisionEvidence) { assert.ok(record.actor && record.why && record.policy && record.timestamp && record.decision); assert.equal(record.status, undefined); }
});
test('human approval does not itself grant access or propagate to an agent', () => {
  const state = approve(evaluate(initialState()));
  assert.equal(state.review, 'approved'); assert.equal(state.decisionEvidence.length, decisions.length + 1);
  assert.ok(!humanAccess(state).some(d => d.entitlement === 'payment-approval'));
  assert.ok(!agentAccess(state).some(d => d.entitlement === 'payment-approval'));
  assert.equal(state.fulfillmentEvidence.length, 0);
});
test('fulfillment enforces SoD execution order and independent agent payment block', () => {
  const state = run(approve(evaluate(initialState())));
  assert.equal(state.tasks['h-ar'].status, 'Removed'); assert.equal(state.tasks['h-payment'].status, 'Granted'); assert.equal(state.tasks['a-payment'].status, 'Blocked');
  const removal = state.fulfillmentEvidence.find(e => e.rowId === 'h-ar');
  const grant = state.fulfillmentEvidence.find(e => e.rowId === 'h-payment');
  assert.ok(removal.timestamp < grant.timestamp);
  assert.equal(readiness(state), true); assert.equal(controlComplete(state), false);
  assert.ok(!agentAccess(state).some(d => d.entitlement === 'payment-approval'));
  assert.ok(humanAccess(state).some(d => d.entitlement === 'legacy-write'));
  for (const record of state.fulfillmentEvidence) { assert.ok(record.method && record.status && record.owner && record.sla && record.reference && record.timestamp); assert.equal(record.decision, undefined); }
});
test('pending review withholds payments while required role access is ready', () => {
  const state = run(evaluate(initialState()));
  assert.equal(readiness(state), true); assert.equal(state.tasks['h-payment'].status, 'Awaiting approval');
  assert.ok(!humanAccess(state).some(d => d.entitlement === 'payment-approval'));
});
test('denial produces a traceable withheld grant and preserves required access', () => {
  const state = run(deny(evaluate(initialState())));
  assert.equal(state.tasks['h-payment'].status, 'Not granted'); assert.equal(state.tasks['a-payment'].status, 'Blocked');
  assert.equal(readiness(state), true);
  assert.ok(state.decisionEvidence.some(e => e.rowId === 'h-payment' && e.decision === 'DENIED'));
  assert.ok(state.fulfillmentEvidence.some(e => e.rowId === 'h-payment' && e.status === 'Not granted'));
});
test('late approval is recorded separately and requires explicit execution', () => {
  let state = approve(run(evaluate(initialState())));
  assert.equal(state.tasks['h-payment'].status, 'Ready to execute'); assert.ok(!humanAccess(state).some(d => d.entitlement === 'payment-approval'));
  assert.deepEqual(restore(state), state);
  state = run(state); assert.equal(state.tasks['h-payment'].status, 'Granted');
  assert.deepEqual(restore(state), state);
});
test('late denial records fulfillment evidence without running a grant', () => {
  const state = deny(run(evaluate(initialState())));
  assert.equal(state.tasks['h-payment'].status, 'Not granted');
  assert.ok(state.fulfillmentEvidence.some(e => e.rowId === 'h-payment' && e.status === 'Not granted'));
  assert.deepEqual(restore(state), state);
});
test('legacy completion needs a reference and verification and covers both access paths', () => {
  const state = run(approve(evaluate(initialState())));
  assert.equal(reduce(state, { type: 'COMPLETE_LEGACY', reference: '', note: 'Done' }), state);
  assert.equal(reduce(state, { type: 'COMPLETE_LEGACY', reference: 'Ref', note: ' ' }), state);
  const completed = complete(state);
  assert.equal(controlComplete(completed), true);
  assert.ok(!humanAccess(completed).some(d => d.entitlement === 'legacy-write'));
  assert.ok(!agentAccess(completed).some(d => d.entitlement === 'legacy-write'));
  assert.equal(completed.fulfillmentEvidence.filter(e => e.reference === 'DBA-VERIFY-0842').length, 2);
  assert.equal(completed.fulfillmentEvidence.filter(e => e.status === 'Task open').length, 2);
});
test('repeated actions cannot duplicate evidence or change the scenario clock', () => {
  const evaluated = evaluate(initialState()); assert.equal(evaluate(evaluated), evaluated);
  const approved = approve(evaluated); assert.equal(approve(approved), approved); assert.equal(deny(approved), approved);
  const executed = run(approved); assert.equal(run(executed), executed);
  const pending = run(evaluated); assert.equal(run(pending), pending);
  const completed = complete(executed); assert.equal(complete(completed), completed);
});
test('reset restores all original human and agent access and clears both evidence trails', () => {
  const reset = reduce(complete(run(approve(evaluate(initialState())))), { type: 'RESET' });
  assert.deepEqual(reset, initialState()); assert.equal(humanAccess(reset).length, 4); assert.equal(agentAccess(reset).length, 4);
});
test('reload reproduces approval, denial and late-review histories exactly', () => {
  for (const state of [initialState(), evaluate(initialState()), approve(evaluate(initialState())), complete(run(approve(evaluate(initialState())))), complete(run(deny(evaluate(initialState())))), approve(complete(run(evaluate(initialState())))), run(approve(complete(run(evaluate(initialState())))))]) assert.deepEqual(restore(state), state);
});
test('corrupt or unavailable storage recovers safely and cannot forge access', () => {
  for (const raw of ['{', '{}', '{"version":999}', '{"version":1,"actions":[{"type":"UNSUPPORTED"}]}']) assert.deepEqual(restoreState({ getItem: () => raw }), initialState());
  assert.deepEqual(restoreState({ getItem: () => { throw Error('Storage unavailable'); } }), initialState());
  const tampered = { ...initialState(), tasks: { 'h-payment': { status: 'Granted' } } };
  assert.deepEqual(restore(tampered), initialState());
});
test('all records use deterministic scenario timestamps and IDs', () => {
  const a = complete(run(approve(evaluate(initialState()))));
  const b = complete(run(approve(evaluate(initialState()))));
  assert.deepEqual(a, b);
  assert.equal(a.fulfillmentEvidence[0].timestamp.slice(0, 10), '2026-10-12');
  assert.equal(a.decisionEvidence[0].timestamp.slice(0, 10), '2026-10-09');
  assert.equal(new Set(a.fulfillmentEvidence.map(e => e.id)).size, a.fulfillmentEvidence.length);
});
