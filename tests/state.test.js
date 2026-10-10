import test from 'node:test';
import assert from 'node:assert/strict';
import { decisions, identities, applications, entitlements, agents, policies } from '../src/data/catalog.js';
import { SCENARIO, REVIEWER } from '../src/data/scenario.js';
import {
  initialState, demoReducer as reduce, getAccessDecision, actionLabel, canApplyDecisions,
  decisionSummary, fulfillmentStatus, legacyTaskRows, humanAccess, agentAccess, isUndecidedRecommendation,
  readiness, connectedChangeSummary, controlComplete, restoreState, STORAGE_KEY, lifecycleStatus, sarahResumeTarget,
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

test('recommendation counts include ServiceNow while preserving the agent scenario', () => {
  const count = scope => decisions.filter(item => scope === 'human' ? item.scope === 'human' : item.scope !== 'human')
    .reduce((counts, item) => ({ ...counts, [item.recommendedAction]: (counts[item.recommendedAction] || 0) + 1 }), {});
  assert.deepEqual(count('human'), { KEEP: 3, GRANT: 3, REMOVE: 2, REVIEW: 1 });
  assert.deepEqual(count('agent'), { KEEP: 3, GRANT: 1, REMOVE: 2, NOT_PERMITTED: 1 });
  assert.equal(actionLabel('NOT_PERMITTED'), 'Not permitted by policy');
  assert.equal(actionLabel('DO_NOT_GRANT'), 'Do not grant');
});

test('evaluation creates recommendations without any access or provisioning change', () => {
  const start = initialState();
  for (const action of [{ type: 'ACCEPT_ALL', scope: 'human' }, { type: 'REVIEW', result: 'approved', note: 'Approved' }, { type: 'DECIDE', rowId: 'h-budget', action: 'GRANT' }, { type: 'APPLY_DECISIONS' }, { type: 'RUN_FULFILLMENT' }]) assert.equal(reduce(start, action), start);
  const state = evaluate(start);
  assert.equal(state.decisionEvidence.length, 16);
  assert.equal(state.fulfillmentEvidence.length, 0);
  assert.equal(state.applied, false);
  assert.deepEqual(state.tasks, {});
  assert.equal(humanAccess(state).length, 5);
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
  assert.equal(decisionSummary(human).decided, 9);
  for (const item of decisions.filter(item => item.scope === 'human' && item.id !== 'h-payment')) assert.equal(decision(human, item.id).status, 'Accepted');
  assert.equal(decision(human, 'h-payment').decidedAction, null);
  assert.equal(decision(human, 'a-bi').decidedAction, null);
  const both = accept(human, 'agent');
  assert.equal(decisionSummary(both).decided, 15);
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
  assert.equal(decisionSummary(state).decided, 15);
});

for (const scope of ['human', 'agent']) {
  test(`bulk acceptance preserves all recorded ${scope} decision sources, rationale and evidence through replay and provisioning`, () => {
    const prefix = scope === 'human' ? 'h' : 'a';
    let state = evaluate(initialState());
    const dashboard = `${prefix}-dashboard`;
    const retained = scope === 'human' ? 'h-bi' : 'a-reports';
    const accepted = scope === 'human' ? 'h-sap' : 'a-bi';
    const legacy = `${prefix}-legacy`;
    for (const action of [
      { rowId: dashboard, action: 'DO_NOT_GRANT', comment: 'Dashboard access is not required.', decisionSource: 'rejected-recommendation' },
      { rowId: retained, action: 'KEEP', comment: 'Read-only reporting remains required.', decisionSource: 'manual-override' },
      { rowId: legacy, action: 'KEEP', comment: 'Legacy access remains required.', decisionSource: 'manual-override' },
      { rowId: accepted, action: 'KEEP', comment: '', decisionSource: 'accepted-recommendation' },
    ]) state = reduce(state, { type: 'DECIDE', ...action });
    state = approve(state);
    const previous = state;
    const undecided = decisions.filter(item => (scope === 'human' ? item.scope === 'human' : item.scope !== 'human')
      && isUndecidedRecommendation(decision(state, item.id)));
    const bulk = accept(state, scope);
    assert.equal(bulk.decisionEvidence.length, previous.decisionEvidence.length + undecided.length);
    for (const id of [dashboard, retained, legacy, accepted, 'h-payment', 'a-payment']) {
      assert.equal(decision(bulk, id), decision(previous, id));
      assert.deepEqual(bulk.decisionEvidence.filter(record => record.rowId === id), previous.decisionEvidence.filter(record => record.rowId === id));
      assert.equal(isUndecidedRecommendation(decision(bulk, id)), false);
    }
    for (const item of undecided) assert.equal(decision(bulk, item.id).decisionSource, 'accepted-recommendation');
    assert.equal(accept(bulk, scope), bulk);
    assert.deepEqual(restore(bulk), bulk);
    const provisioned = run(apply(acceptBoth(bulk)));
    assert.equal(provisioned.tasks[dashboard].status, 'Not granted');
    assert.equal(provisioned.tasks[legacy].status, 'Retained');
    assert.equal(decision(provisioned, dashboard).decisionSource, 'rejected-recommendation');
    assert.equal(decision(provisioned, retained).decisionSource, 'manual-override');
    assert.equal(decision(provisioned, 'a-payment').decisionSource, 'policy-locked');
    assert.equal(decision(provisioned, 'h-payment').decisionSource, 'high-risk-review');
    assert.deepEqual(restore(provisioned), provisioned);
    assert.deepEqual(reduce(provisioned, { type: 'RESET' }), initialState());
  });
}

test('existing saved actions recover provenance without trusting stored derived decision fields', () => {
  let state = evaluate(initialState());
  state = decide(state, 'h-dashboard', 'DO_NOT_GRANT', 'Dashboard is not required.');
  state = decide(state, 'a-reports', 'KEEP', 'Read-only reporting remains approved.');
  state = decide(state, 'h-sap', 'KEEP');
  const saved = JSON.parse(JSON.stringify(state));
  for (const model of Object.values(saved.accessDecisions)) delete model.decisionSource;
  const restored = restore(saved);
  assert.equal(decision(restored, 'h-dashboard').decisionSource, 'manual-override');
  assert.equal(decision(restored, 'a-reports').decisionSource, 'manual-override');
  assert.equal(decision(restored, 'h-sap').decisionSource, 'accepted-recommendation');
  const both = acceptBoth(restored);
  for (const id of ['h-dashboard', 'a-reports', 'h-sap']) assert.deepEqual(decision(both, id), decision(restored, id));
  assert.equal(decision(restore(saved), 'a-payment').decisionSource, 'policy-locked');
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

test('human payment approval survives action replay and reconfirmation without granting agent payment or duplicating evidence', () => {
  const approved = approve(acceptBoth(evaluate(initialState())));
  const restored = restore(approved);
  assert.deepEqual(decision(restored, 'h-payment'), decision(approved, 'h-payment'));
  assert.equal(restored.review, 'approved');
  assert.equal(decision(restored, 'a-payment').decidedAction, 'NOT_PERMITTED');
  assert.equal(approve(restored), restored);
  assert.equal(restored.decisionEvidence.filter(record => record.rowId === 'h-payment' && record.decidedAction === 'GRANT').length, 1);
  const provisioned = run(apply(restored));
  assert.equal(provisioned.tasks['h-payment'].status, 'Granted');
  assert.equal(provisioned.tasks['a-payment'].status, 'Not permitted by policy');
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
  assert.equal(humanAccess(applied).length, 5);
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
  assert.equal(summary.decided, 16);
  assert.equal(summary.total, 16);
  assert.deepEqual(summary.byAction, { KEEP: 6, GRANT: 5, REMOVE: 4, REVIEW: 0, NOT_PERMITTED: 1, DO_NOT_GRANT: 0 });
  assert.equal(summary.byApplication.reduce((sum, app) => sum + app.count, 0), 16);
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
  assert.equal(humanAccess(reset).length, 5);
  assert.equal(agentAccess(reset).length, 4);
});


test('connected change counts exclude unchanged access, policy locks and manual removals, and follow overrides', () => {
  assert.deepEqual(connectedChangeSummary(apply(readyToApply())), { total: 7, completed: 0 });
  assert.deepEqual(connectedChangeSummary(provisioned()), { total: 7, completed: 7 });
  const withheld = decide(readyToApply(), 'h-budget', 'DO_NOT_GRANT', 'Budget approval remains with the controller.');
  assert.deepEqual(connectedChangeSummary(run(apply(withheld))), { total: 6, completed: 6 });
  const extraRemoval = decide(readyToApply(), 'h-bi', 'REMOVE', 'Remove reporting access.');
  assert.deepEqual(connectedChangeSummary(run(apply(extraRemoval))), { total: 8, completed: 8 });
});

test('ServiceNow current and target access follows both recorded recommendations', () => {
  assert.equal(decisions.length, 16);
  assert.equal(entitlements.length, 40);
  assert.equal(entitlements.find(item => item.id === 'snow-user').name, 'Employee Self Service');
  assert.equal(entitlements.find(item => item.id === 'snow-change').name, 'Finance Request Approver');
  assert.ok(identities[0].access.includes('snow-user'));
  assert.ok(!identities[0].access.includes('snow-change'));
  const applied = apply(readyToApply());
  assert.ok(humanAccess(applied).some(item => item.id === 'h-snow-self'));
  assert.ok(!humanAccess(applied).some(item => item.id === 'h-snow-approver'));
  const executed = run(applied);
  assert.equal(executed.tasks['h-snow-self'].status, 'Retained');
  assert.equal(executed.tasks['h-snow-approver'].status, 'Granted');
  assert.ok(humanAccess(executed).some(item => item.id === 'h-snow-approver'));
  assert.equal(executed.fulfillmentEvidence.find(item => item.rowId === 'h-snow-approver').method, 'Application connector API');
});

test('manual-task resume and lifecycle completion persist, reset and never duplicate history', () => {
  const open = provisioned();
  assert.equal(sarahResumeTarget(initialState()), 'event');
  assert.equal(sarahResumeTarget(open), 'provisioning');
  assert.equal(lifecycleStatus(open), 'Manual task open');
  assert.equal(open.legacyTask.status, 'Task open');
  assert.deepEqual(open.legacyTask.rowIds.toSorted(), ['a-legacy', 'h-legacy']);
  assert.deepEqual(restore(open), open);
  assert.deepEqual(open.lifecycleEvidence, []);
  const completed = complete(open);
  assert.equal(sarahResumeTarget(completed), 'audit');
  assert.equal(lifecycleStatus(completed), 'Completed');
  assert.equal(completed.legacyTask.status, 'Completed');
  assert.equal(completed.legacyTask.reference, 'DBA-VERIFY-0842');
  assert.equal(completed.lifecycleEvidence.length, 1);
  assert.equal(completed.lifecycleEvidence[0].status, 'Completed');
  assert.equal(completed.lifecycleEvidence[0].task, 'SN-TASK-004812');
  assert.ok(completed.lifecycleEvidence[0].timestamp.startsWith('2026-10-19'));
  assert.deepEqual(restore(completed), completed);
  assert.equal(complete(completed), completed);
  const reset = reduce(completed, { type: 'RESET' });
  assert.equal(reset.legacyTask, null);
  assert.deepEqual(reset.lifecycleEvidence, []);
  const noManual = run(apply(approve(acceptBoth(['h-legacy', 'a-legacy'].reduce((state, id) => decide(state, id, 'KEEP', 'Retained under approved duties.'), evaluate(initialState()))))));
  assert.equal(noManual.legacyTask, null);
  assert.equal(noManual.lifecycleEvidence.length, 1);
  assert.equal(sarahResumeTarget(noManual), 'audit');
});

test('version 2 applied sessions migrate ServiceNow decisions and preserve approval, edits and completion', () => {
  const legacyActions = [
    { type: 'EVALUATE' },
    ...decisions.filter(item => item.scope === 'human' && !['REVIEW'].includes(item.recommendedAction) && !item.id.startsWith('h-snow')).map(item => ({ type: 'DECIDE', rowId: item.id, action: item.recommendedAction })),
    { type: 'ACCEPT_ALL', scope: 'agent' },
    { type: 'REVIEW', result: 'approved', note: 'Approval retained from the prior version.' },
    { type: 'DECIDE', rowId: 'h-budget', action: 'DO_NOT_GRANT', comment: 'Budget approval remains with the controller.' },
    { type: 'APPLY_DECISIONS' }, { type: 'RUN_FULFILLMENT' },
    { type: 'COMPLETE_LEGACY', reference: 'DBA-OLD-0842', note: 'Both removals independently verified.' },
  ];
  const migrated = restore({ version: 2, actions: legacyActions });
  assert.equal(migrated.version, 3);
  assert.equal(migrated.applied, true);
  assert.equal(migrated.legacyTask.status, 'Completed');
  assert.equal(decision(migrated, 'h-payment').comment, 'Approval retained from the prior version.');
  assert.equal(decision(migrated, 'h-budget').decidedAction, 'DO_NOT_GRANT');
  assert.equal(decision(migrated, 'h-snow-self').decidedAction, 'KEEP');
  assert.equal(decision(migrated, 'h-snow-approver').decidedAction, 'GRANT');
  assert.equal(migrated.tasks['h-snow-approver'].status, 'Granted');
  assert.equal(migrated.lifecycleEvidence.length, 1);
  assert.deepEqual(restore(migrated), migrated);
});
