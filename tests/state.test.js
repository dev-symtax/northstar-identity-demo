import test from 'node:test';
import assert from 'node:assert/strict';
import { decisions, identities, applications, entitlements, agents, policies } from '../src/data/catalog.js';
import { SCENARIO, REVIEWER } from '../src/data/scenario.js';
import {
  initialState, demoReducer as reduce, getAccessDecision, actionLabel, canApplyDecisions,
  decisionSummary, fulfillmentStatus, legacyTaskRows, humanAccess, agentAccess,
  readiness, connectedChangeSummary, controlComplete, restoreState, STORAGE_KEY,
} from '../src/demo/state.js';

const row = id => decisions.find(item => item.id === id);
const decision = (state, id) => getAccessDecision(row(id), state);
const evaluate = state => reduce(state, { type: 'EVALUATE' });
const accept = (state, scope) => reduce(state, { type: 'ACCEPT_ALL', scope });
const acceptBoth = state => accept(accept(state, 'human'), 'agent');
const approve = state => reduce(state, { type: 'REVIEW', result: 'approved', note: 'Approved after removal of incompatible receivables access.' });
const deny = state => reduce(state, { type: 'REVIEW', result: 'rejected', note: 'Payment approval remains with the Treasury team.' });
const decide = (state, rowId, action, comment = '') => reduce(state, { type: 'DECIDE', rowId, action, comment });
const apply = state => reduce(state, { type: 'APPLY_DECISIONS' });
const run = state => reduce(state, { type: 'RUN_FULFILLMENT' });
const complete = state => reduce(state, { type: 'COMPLETE_LEGACY', reference: 'DBA-VERIFY-0842', note: 'Selected write access revoked and verified.' });
const restore = state => restoreState({ getItem: () => JSON.stringify(state) });
const readyToApply = () => approve(acceptBoth(evaluate(initialState())));
const provisioned = () => run(apply(readyToApply()));


test('enterprise catalog preserves counts, unique relationships, policies and owner', () => {
  assert.equal(identities.length, 48); assert.equal(applications.length, 12); assert.equal(entitlements.length, 40); assert.equal(agents.length, 4);
  for (const dataset of [identities, applications, entitlements, agents, decisions, policies]) assert.equal(new Set(dataset.map(item => item.id)).size, dataset.length);
  for (const identity of identities) for (const id of identity.access) assert.ok(entitlements.some(item => item.id === id));
  for (const entitlement of entitlements) assert.ok(applications.some(item => item.id === entitlement.app));
  for (const recommendation of decisions) {
    assert.ok(policies.some(item => item.id === recommendation.policyId));
    assert.ok(recommendation.reason);
    assert.equal(recommendation.recommendedAction, recommendation.decision);
    if (recommendation.entitlement) assert.ok(entitlements.some(item => item.id === recommendation.entitlement));
  }
  assert.equal(agents.find(item => item.id === 'finance-agent').owner, 'Sarah Miller');
});

test('recommendation counts match the unchanged human and agent scenarios', () => {
  const count = scope => decisions.filter(item => scope === 'human' ? item.scope === 'human' : item.scope !== 'human')
    .reduce((counts, item) => ({ ...counts, [item.recommendedAction]: (counts[item.recommendedAction] || 0) + 1 }), {});
  assert.deepEqual(count('human'), { KEEP: 2, GRANT: 2, REMOVE: 2, REVIEW: 1 });
  assert.deepEqual(count('agent'), { KEEP: 3, GRANT: 1, REMOVE: 2, NOT_PERMITTED: 1 });
  assert.equal(actionLabel('NOT_PERMITTED'), 'Not permitted by policy');
  assert.equal(actionLabel('DO_NOT_GRANT'), 'Do not grant');
});

test('evaluation creates recommendations without any access or provisioning change', () => {
  const start = initialState();
  for (const action of [{ type: 'ACCEPT_ALL', scope: 'human' }, { type: 'REVIEW', result: 'approved', note: 'Approved' }, { type: 'DECIDE', rowId: 'h-budget', action: 'GRANT' }, { type: 'APPLY_DECISIONS' }, { type: 'RUN_FULFILLMENT' }]) assert.equal(reduce(start, action), start);
  const state = evaluate(start);
  assert.equal(state.decisionEvidence.length, 14);
  assert.equal(state.fulfillmentEvidence.length, 0);
  assert.equal(state.applied, false);
  assert.deepEqual(state.tasks, {});
  assert.equal(humanAccess(state).length, 4);
  assert.equal(agentAccess(state).length, 4);
  assert.equal(readiness(state), false);
  assert.equal(decision(state, 'h-budget').decidedAction, null);
  assert.equal(decision(state, 'h-budget').status, 'Recommended');
  assert.equal(decision(state, 'h-payment').status, 'Needs review');
  for (const record of state.decisionEvidence) assert.equal(record.timestamp, SCENARIO.receivedAt);
});

test('agent payment permission is automatically policy-locked and cannot be changed', () => {
  const state = evaluate(initialState());
  const locked = decision(state, 'a-payment');
  assert.equal(locked.decidedAction, 'NOT_PERMITTED');
  assert.equal(locked.status, 'Policy-locked');
  assert.equal(locked.decidedAt, SCENARIO.receivedAt);
  assert.equal(locked.reason, 'Payment approval is restricted to human identities (POL-AI-303).');
  for (const action of ['GRANT', 'REMOVE', 'DO_NOT_GRANT', 'NOT_PERMITTED']) assert.equal(decide(state, 'a-payment', action, 'Override policy'), state);
});

test('bulk acceptance only decides standard rows in the selected tab', () => {
  const evaluated = evaluate(initialState());
  const human = accept(evaluated, 'human');
  assert.equal(decisionSummary(human).decided, 7);
  for (const item of decisions.filter(item => item.scope === 'human' && item.id !== 'h-payment')) assert.equal(decision(human, item.id).status, 'Accepted');
  assert.equal(decision(human, 'h-payment').decidedAction, null);
  assert.equal(decision(human, 'a-bi').decidedAction, null);
  const both = accept(human, 'agent');
  assert.equal(decisionSummary(both).decided, 13);
  assert.equal(decision(both, 'a-payment').status, 'Policy-locked');
  assert.equal(accept(both, 'human'), both);
  assert.equal(accept(both, 'agent'), both);
});

test('new access can be changed to do not grant only with a comment', () => {
  const state = evaluate(initialState());
  assert.equal(decide(state, 'h-budget', 'DO_NOT_GRANT'), state);
  assert.equal(decide(state, 'h-budget', 'DO_NOT_GRANT', '  '), state);
  const changed = decide(state, 'h-budget', 'DO_NOT_GRANT', '  Budget approval remains with the regional controller.  ');
  assert.equal(decision(changed, 'h-budget').status, 'Changed');
  assert.equal(decision(changed, 'h-budget').comment, 'Budget approval remains with the regional controller.');
  assert.equal(decision(changed, 'h-budget').decidedBy, `${REVIEWER.name} · ${REVIEWER.role}`);
  assert.equal(decision(changed, 'h-budget').decidedAt, SCENARIO.approvalAt);
  assert.equal(decide(state, 'h-budget', 'KEEP', 'Wrong context'), state);
  assert.equal(decide(state, 'h-sap', 'GRANT', 'Wrong context'), state);
  assert.equal(decide(state, 'missing', 'GRANT'), state);
});

test('bulk acceptance preserves already changed choices and their comments', () => {
  const changed = decide(evaluate(initialState()), 'h-budget', 'DO_NOT_GRANT', 'Retain approval with the controller.');
  const state = acceptBoth(changed);
  assert.equal(decision(state, 'h-budget').decidedAction, 'DO_NOT_GRANT');
  assert.equal(decision(state, 'h-budget').comment, 'Retain approval with the controller.');
  assert.equal(decisionSummary(state).decided, 13);
});

test('approval requires a comment, remains editable before apply and grants nothing itself', () => {
  const evaluated = evaluate(initialState());
  assert.equal(reduce(evaluated, { type: 'REVIEW', result: 'approved', note: '' }), evaluated);
  assert.equal(decide(evaluated, 'h-payment', 'GRANT', 'Bypass reviewer'), evaluated);
  const approved = approve(evaluated);
  assert.equal(approved.review, 'approved');
  assert.equal(decision(approved, 'h-payment').decidedAction, 'GRANT');
  assert.equal(decision(approved, 'h-payment').status, 'Accepted');
  assert.equal(humanAccess(approved).some(item => item.id === 'h-payment'), false);
  assert.equal(agentAccess(approved).some(item => item.id === 'a-payment'), false);
  assert.equal(approved.fulfillmentEvidence.length, 0);
  const denied = deny(approved);
  assert.equal(denied.review, 'rejected');
  assert.equal(decision(denied, 'h-payment').decidedAction, 'DO_NOT_GRANT');
  assert.equal(approve(denied).review, 'approved');
});

test('SoD guardrail blocks Keep on receivables while payment is pending or approved', () => {
  for (const state of [evaluate(initialState()), approve(evaluate(initialState()))]) {
    const result = decide(state, 'h-ar', 'KEEP', 'Operational duties are still required.');
    assert.equal(result, state);
    assert.equal(decision(result, 'h-ar').decidedAction, null);
  }
});

test('SoD deny-payment resolution atomically saves the attempted receivables Keep', () => {
  const state = approve(acceptBoth(evaluate(initialState())));
  assert.equal(reduce(state, { type: 'RESOLVE_SOD', resolution: 'deny-payment', comment: '' }), state);
  const resolved = reduce(state, { type: 'RESOLVE_SOD', resolution: 'deny-payment', comment: 'Retain receivables; payment approval remains with Treasury.' });
  assert.equal(resolved.review, 'rejected');
  assert.equal(decision(resolved, 'h-ar').decidedAction, 'KEEP');
  assert.equal(decision(resolved, 'h-ar').status, 'Changed');
  assert.equal(decision(resolved, 'h-payment').decidedAction, 'DO_NOT_GRANT');
  assert.equal(resolved.decisionEvidence.length, state.decisionEvidence.length + 2);
  assert.equal(canApplyDecisions(resolved), true);
  assert.equal(approve(resolved), resolved);
});

test('SoD remove-receivables resolution permits approval and keeps a valid sequence', () => {
  const denied = deny(acceptBoth(evaluate(initialState())));
  const kept = decide(denied, 'h-ar', 'KEEP', 'Retain operational access.');
  assert.equal(approve(kept), kept);
  const resolved = reduce(kept, { type: 'RESOLVE_SOD', resolution: 'remove-ar', comment: 'Remove conflicting operational access.' });
  const approved = approve(resolved);
  assert.equal(decision(approved, 'h-ar').decidedAction, 'REMOVE');
  assert.equal(approved.review, 'approved');
  assert.equal(canApplyDecisions(approved), true);
});

test('Apply decisions requires every row and a resolved policy review', () => {
  const evaluated = evaluate(initialState());
  const partiallyAccepted = approve(accept(evaluated, 'human'));
  const unresolved = acceptBoth(evaluated);
  for (const state of [initialState(), evaluated, partiallyAccepted, unresolved]) {
    assert.equal(canApplyDecisions(state), false);
    assert.equal(apply(state), state);
    assert.equal(run(state), state);
  }
  const decided = readyToApply();
  assert.equal(canApplyDecisions(decided), true);
  const applied = apply(decided);
  assert.equal(applied.applied, true);
  assert.equal(applied.fulfillmentStarted, false);
  assert.deepEqual(applied.tasks, {});
  assert.equal(applied.fulfillmentEvidence.length, 0);
  assert.equal(humanAccess(applied).length, 4);
  assert.equal(fulfillmentStatus(row('h-budget'), applied), 'Scheduled');
});

test('applied decisions are immutable including review, standard rows and guardrail resolutions', () => {
  const state = apply(readyToApply());
  for (const action of [
    { type: 'DECIDE', rowId: 'h-budget', action: 'DO_NOT_GRANT', comment: 'Change after apply' },
    { type: 'REVIEW', result: 'rejected', note: 'Change after apply' },
    { type: 'ACCEPT_ALL', scope: 'human' },
    { type: 'RESOLVE_SOD', resolution: 'deny-payment', comment: 'Change after apply' },
    { type: 'APPLY_DECISIONS' },
  ]) assert.equal(reduce(state, action), state);
});

test('decision summary lists applied choices by action and application', () => {
  const summary = decisionSummary(readyToApply());
  assert.equal(summary.decided, 14);
  assert.equal(summary.total, 14);
  assert.deepEqual(summary.byAction, { KEEP: 5, GRANT: 4, REMOVE: 4, REVIEW: 0, NOT_PERMITTED: 1, DO_NOT_GRANT: 0 });
  assert.equal(summary.byApplication.reduce((sum, app) => sum + app.count, 0), 14);
  assert.equal(summary.byApplication.find(app => app.application === 'SAP S/4HANA').counts.REMOVE, 2);
});

test('provisioning removes conflicting access before granting payment approval', () => {
  const state = provisioned();
  assert.equal(state.tasks['h-ar'].status, 'Removed');
  assert.equal(state.tasks['h-payment'].status, 'Granted');
  assert.equal(state.tasks['a-payment'].status, 'Not permitted by policy');
  assert.ok(state.fulfillmentEvidence.find(item => item.rowId === 'h-ar').timestamp < state.fulfillmentEvidence.find(item => item.rowId === 'h-payment').timestamp);
  assert.equal(readiness(state), true);
  assert.equal(controlComplete(state), false);
  assert.equal(humanAccess(state).some(item => item.id === 'h-payment'), true);
  assert.equal(agentAccess(state).some(item => item.id === 'a-payment'), false);
  assert.equal(legacyTaskRows(state).length, 2);
  for (const record of state.fulfillmentEvidence) assert.ok(record.method && record.status && record.owner && record.sla && record.reference);
});

test('do not grant overrides drive provisioning and remain visible in decision history', () => {
  const edited = decide(evaluate(initialState()), 'h-budget', 'DO_NOT_GRANT', 'Budget approval stays with the regional controller.');
  const state = run(apply(approve(acceptBoth(edited))));
  assert.equal(state.tasks['h-budget'].status, 'Not granted');
  assert.equal(humanAccess(state).some(item => item.id === 'h-budget'), false);
  const record = state.decisionEvidence.filter(item => item.rowId === 'h-budget').at(-1);
  assert.equal(record.recommendedAction, 'GRANT');
  assert.equal(record.decidedAction, 'DO_NOT_GRANT');
  assert.equal(record.status, 'Changed');
  assert.equal(record.comment, 'Budget approval stays with the regional controller.');
  assert.equal(state.fulfillmentEvidence.find(item => item.rowId === 'h-budget').method, 'Grant withheld by access decision');
  assert.equal(readiness(state), true);
});

test('denied payment and retained receivables result in no conflicting grant', () => {
  const resolved = reduce(readyToApply(), { type: 'RESOLVE_SOD', resolution: 'deny-payment', comment: 'Keep receivables operations and deny payment approval.' });
  const state = run(apply(resolved));
  assert.equal(state.tasks['h-ar'].status, 'Retained');
  assert.equal(state.tasks['h-payment'].status, 'Not granted');
  assert.equal(humanAccess(state).some(item => item.id === 'h-ar'), true);
  assert.equal(humanAccess(state).some(item => item.id === 'h-payment'), false);
});

test('legacy completion requires reference and note and closes selected human and agent removals', () => {
  const state = provisioned();
  assert.equal(reduce(state, { type: 'COMPLETE_LEGACY', reference: '', note: 'Verified' }), state);
  assert.equal(reduce(state, { type: 'COMPLETE_LEGACY', reference: 'DBA-0842', note: ' ' }), state);
  const completed = complete(state);
  assert.equal(legacyTaskRows(completed).length, 0);
  assert.equal(controlComplete(completed), true);
  assert.equal(humanAccess(completed).some(item => item.id === 'h-legacy'), false);
  assert.equal(agentAccess(completed).some(item => item.id === 'a-legacy'), false);
  assert.equal(completed.fulfillmentEvidence.filter(item => item.reference === 'DBA-VERIFY-0842').length, 2);
});

for (const keptId of ['h-legacy', 'a-legacy']) {
  test(`legacy completion respects independent Keep on ${keptId}`, () => {
    const edited = decide(evaluate(initialState()), keptId, 'KEEP', 'Access remains required under an approved business responsibility.');
    const state = run(apply(approve(acceptBoth(edited))));
    assert.equal(state.tasks[keptId].status, 'Retained');
    assert.deepEqual(legacyTaskRows(state).map(item => item.id), [keptId === 'h-legacy' ? 'a-legacy' : 'h-legacy']);
    const completed = complete(state);
    assert.equal(completed.tasks[keptId].status, 'Retained');
    assert.equal(completed.fulfillmentEvidence.filter(item => item.reference === 'DBA-VERIFY-0842').length, 1);
    assert.equal(controlComplete(completed), true);
  });
}

test('no manual task is created when both legacy access recommendations are changed to Keep', () => {
  let edited = evaluate(initialState());
  for (const id of ['h-legacy', 'a-legacy']) edited = decide(edited, id, 'KEEP', 'Read/write access remains an approved business requirement.');
  const state = run(apply(approve(acceptBoth(edited))));
  assert.deepEqual(legacyTaskRows(state), []);
  assert.equal(state.fulfillmentEvidence.some(item => item.status === 'Task open'), false);
  assert.equal(complete(state), state);
  assert.equal(controlComplete(state), true);
});

test('existing Keep recommendations may be changed to Remove and provisioned', () => {
  const edited = decide(evaluate(initialState()), 'h-bi', 'REMOVE', 'Finance reporting will use the management dashboard.');
  const state = run(apply(approve(acceptBoth(edited))));
  assert.equal(state.tasks['h-bi'].status, 'Removed');
  assert.equal(humanAccess(state).some(item => item.id === 'h-bi'), false);
});

test('repeated completed operations never duplicate audit history or advance scenario time', () => {
  const evaluated = evaluate(initialState());
  assert.equal(evaluate(evaluated), evaluated);
  const decided = readyToApply();
  assert.equal(approve(decided), decided);
  const executed = provisioned();
  assert.equal(run(executed), executed);
  const completed = complete(executed);
  assert.equal(complete(completed), completed);
});

test('records use the preserved deterministic dates, full reviewer and unique IDs', () => {
  const state = complete(provisioned());
  assert.deepEqual(state, complete(provisioned()));
  for (const record of state.decisionEvidence) {
    assert.equal(record.timestamp, record.decidedBy?.startsWith(REVIEWER.name) ? SCENARIO.approvalAt : SCENARIO.receivedAt);
    assert.ok(record.reason && record.policyId && record.actor && record.policy && record.why);
  }
  for (const record of state.fulfillmentEvidence) assert.equal(record.timestamp.slice(0, 10), SCENARIO.effectiveDateISO);
  assert.equal(state.fulfillmentEvidence[0].timestamp, SCENARIO.fulfillmentAt);
  for (const record of state.fulfillmentEvidence.filter(item => ['h-legacy', 'a-legacy'].includes(item.rowId))) assert.equal(record.sla, SCENARIO.legacyDue);
  for (const records of [state.decisionEvidence, state.fulfillmentEvidence]) assert.equal(new Set(records.map(item => item.id)).size, records.length);
});

test('reload reconstructs edited, applied and completed histories without trusting derived fields', () => {
  const edited = decide(evaluate(initialState()), 'h-budget', 'DO_NOT_GRANT', 'Approval remains with the controller.');
  const guarded = reduce(readyToApply(), { type: 'RESOLVE_SOD', resolution: 'deny-payment', comment: 'Retain operational access.' });
  for (const state of [initialState(), evaluate(initialState()), edited, readyToApply(), apply(readyToApply()), provisioned(), complete(provisioned()), guarded]) {
    assert.deepEqual(restore(state), state);
    assert.deepEqual(restore({ ...state, applied: true, tasks: { 'h-payment': { status: 'Granted' } }, decisionEvidence: [] }), state);
  }
});

test('reload supports long editable histories rather than the former ten-action limit', () => {
  let state = evaluate(initialState());
  for (let index = 0; index < 300; index += 1) state = decide(state, 'h-budget', index % 2 === 0 ? 'DO_NOT_GRANT' : 'GRANT', index % 2 === 0 ? `Controller responsibility ${index}` : '');
  assert.ok(state.actions.length > 10);
  assert.deepEqual(restore(state), state);
  const completed = complete(run(apply(approve(acceptBoth(state)))));
  for (const record of completed.fulfillmentEvidence) assert.equal(record.timestamp.slice(0, 10), SCENARIO.effectiveDateISO);
  assert.ok(completed.fulfillmentEvidence.at(-1).timestamp < '2026-10-19T12:00:00.000Z');
});

test('invalid or old stored sessions recover safely and cannot forge provisioning', () => {
  for (const raw of ['{', '{}', '{"version":999}', '{"version":1,"actions":[{"type":"EVALUATE"}]}', '{"version":2,"actions":[{"type":"UNSUPPORTED"}]}', '{"version":2,"actions":[{"type":"APPLY_DECISIONS"}]}']) assert.deepEqual(restoreState({ getItem: () => raw }), initialState());
  assert.deepEqual(restoreState({ getItem: () => { throw Error('Storage unavailable'); } }), initialState());
  assert.deepEqual(restore({ ...initialState(), tasks: { 'h-payment': { status: 'Granted' } } }), initialState());
  const invalid = { version: 2, actions: [{ type: 'EVALUATE' }, { type: 'DECIDE', rowId: 'a-payment', action: 'GRANT', comment: 'Forge policy' }] };
  assert.deepEqual(restore(invalid), initialState());
  assert.equal(STORAGE_KEY, 'northstar-identity-demo-v1');
});

test('reset restores initial recommendations, access and both audit trails', () => {
  const reset = reduce(complete(provisioned()), { type: 'RESET' });
  assert.deepEqual(reset, initialState());
  assert.equal(humanAccess(reset).length, 4);
  assert.equal(agentAccess(reset).length, 4);
});


test('connected change counts exclude unchanged access, policy locks and manual removals, and follow overrides', () => {
  assert.deepEqual(connectedChangeSummary(apply(readyToApply())), { total: 6, completed: 0 });
  assert.deepEqual(connectedChangeSummary(provisioned()), { total: 6, completed: 6 });
  const withheld = decide(readyToApply(), 'h-budget', 'DO_NOT_GRANT', 'Budget approval remains with the controller.');
  assert.deepEqual(connectedChangeSummary(run(apply(withheld))), { total: 5, completed: 5 });
  const extraRemoval = decide(readyToApply(), 'h-bi', 'REMOVE', 'Remove reporting access.');
  assert.deepEqual(connectedChangeSummary(run(apply(extraRemoval))), { total: 7, completed: 7 });
});
