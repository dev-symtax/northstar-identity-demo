import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspacePages, pageRows, lifecycleEvents, actionableTasks } from '../src/data/workspace.js';
import { agents, applications, identities, entitlements, movers } from '../src/data/catalog.js';
import { SCENARIO } from '../src/data/scenario.js';
import { demoReducer as reduce, initialState, agentAccess, restoreState, STORAGE_KEY } from '../src/demo/state.js';

function acceptedState() {
  return [
    { type: 'EVALUATE' }, { type: 'ACCEPT_ALL', scope: 'human' },
    { type: 'REVIEW', result: 'approved', note: 'Approve after conflicting access is removed.' },
    { type: 'ACCEPT_ALL', scope: 'agent' },
  ].reduce(reduce, initialState());
}

test('core applications and connector reports stay connected while the legacy long tail remains manual', () => {
  const connectedIds = ['sap', 'powerbi', 'finance', 'workday', 'entra', 'ad', 'snow', 'salesforce', 'm365', 'legal'];
  const manualIds = ['legacy', 'warehouse'];
  assert.equal(applications.length, 12);
  assert.deepEqual(applications.filter(app => app.mode === 'API').map(app => app.id), connectedIds);
  assert.deepEqual(applications.filter(app => app.mode === 'Controlled task').map(app => app.id), manualIds);
  assert.equal(workspacePages.connectors.rows.length, 10);
  for (const app of workspacePages.applications.rows) {
    assert.equal(app.provisioning, connectedIds.includes(app.id) ? 'Connected · API' : 'Manual');
  }
  assert.deepEqual(workspacePages.connectors.rows.map(connector => connector.appId), connectedIds);
  const ad = workspacePages.connectors.rows.find(connector => connector.appId === 'ad');
  const entra = workspacePages.connectors.rows.find(connector => connector.appId === 'entra');
  assert.equal(ad.status, 'Healthy');
  assert.equal(ad.status, entra.status);
  assert.equal(ad.lastSync, '13 Oct 2026 · 09:00 UTC');
  assert.equal(ad.schedule, entra.schedule);
  assert.equal(ad.authentication, entra.authentication);
  const report = workspacePages.reports.rows.find(report => report.id === 'REP-CONN');
  assert.equal(report.scope, '10 connected applications');
  assert.equal(report.definition, 'All 10 registered API connectors reported a successful synchronization.');
});

test('actionable task records follow approval, manual completion, replay and reset without counting history', () => {
  assert.deepEqual(actionableTasks(initialState()).map(task => task.id), ['TASK-0842']);
  let state = acceptedState();
  assert.equal(actionableTasks(state).length, 0);
  assert.equal(pageRows('tasks', state)[0].status, 'Approved');
  state = reduce(state, { type: 'APPLY_DECISIONS' });
  assert.equal(actionableTasks(state).length, 0);
  state = reduce(state, { type: 'RUN_FULFILLMENT' });
  assert.equal(pageRows('tasks', state).length, 7);
  assert.deepEqual(actionableTasks(state), [{
    id: 'SN-TASK-004812', name: 'Remove Finance database write access', subject: 'User and AI agent',
    policy: 'POL-FIN-101 · POL-AI-302', due: SCENARIO.legacyDue, status: 'Task open',
    owner: 'Martin Keller', linkedEvent: 'WD-MOV-2026-0842',
  }]);
  const restored = value => restoreState({ getItem: key => key === STORAGE_KEY ? JSON.stringify(value) : null });
  assert.deepEqual(actionableTasks(restored(state)), actionableTasks(state));
  state = reduce(state, { type: 'COMPLETE_LEGACY', reference: 'DBA-0842', note: 'Removals independently verified.' });
  assert.equal(actionableTasks(state).length, 0);
  assert.equal(pageRows('tasks', state).length, 7);
  assert.equal(pageRows('tasks', state).at(-1).status, 'Completed');
  assert.equal(pageRows('tasks', state).at(-1).reference, 'DBA-0842');
  assert.equal(actionableTasks(restored(state)).length, 0);
  assert.deepEqual(actionableTasks(reduce(state, { type: 'RESET' })), actionableTasks(initialState()));
});

test('task selection uses each current record status rather than the scenario completion state', () => {
  const rows = workspacePages.tasks.rows;
  const task = { id: 'TASK-INDEPENDENT', name: 'Independent access review', status: 'Needs decision' };
  try {
    workspacePages.tasks.rows = [...rows, task];
    const state = { ...initialState(), review: 'approved', fulfillmentStarted: true };
    assert.deepEqual(actionableTasks(state).map(row => row.id), [task.id]);
    for (const status of ['Completed', 'Approved', 'Denied', 'Scheduled']) {
      workspacePages.tasks.rows = [...rows, { ...task, status }];
      assert.equal(actionableTasks(state).length, 0);
    }
  } finally { workspacePages.tasks.rows = rows; }
});

test('task views follow selected manual scope and create no task when legacy access is retained', () => {
  for (const retained of [['h-legacy'], ['a-legacy'], ['h-legacy', 'a-legacy']]) {
    let state = acceptedState();
    for (const rowId of retained) state = reduce(state, { type: 'DECIDE', rowId, action: 'KEEP', comment: 'Approved retained access.' });
    state = reduce(reduce(state, { type: 'APPLY_DECISIONS' }), { type: 'RUN_FULFILLMENT' });
    if (retained.length === 2) {
      assert.equal(actionableTasks(state).length, 0);
      assert.equal(pageRows('tasks', state).length, 6);
    } else {
      assert.equal(actionableTasks(state).length, 1);
      assert.equal(actionableTasks(state)[0].subject, retained[0] === 'h-legacy' ? 'AI agent only' : 'User only');
    }
  }
});

test('joiner and leaver dates follow HR month boundaries with consistent statuses and unchanged mover facts', () => {
  assert.deepEqual(lifecycleEvents.filter(event => event.type === 'Joiner').map(({ effective, status }) => ({ effective, status })), [
    { effective: 'Thursday, 1 October 2026', status: 'Completed' },
    { effective: 'Thursday, 15 October 2026', status: 'Awaiting effective date' },
    { effective: 'Sunday, 1 November 2026', status: 'Awaiting effective date' },
  ]);
  assert.deepEqual(lifecycleEvents.filter(event => event.type === 'Leaver').map(event => event.effective), ['Wednesday, 30 September 2026', 'Thursday, 1 October 2026']);
  for (const event of lifecycleEvents.filter(event => event.type !== 'Mover')) {
    const at = Date.parse(event.effective);
    const date = new Date(at);
    const endOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    assert.ok([1, 15, endOfMonth].includes(date.getUTCDate()));
    assert.equal(event.status, at < Date.parse(SCENARIO.receivedAt) ? 'Completed' : 'Awaiting effective date');
  }
  assert.deepEqual(lifecycleEvents.filter(event => event.type === 'Mover').map(event => event.effective), movers.map(event => event.effective));
  assert.equal(lifecycleEvents[0].effective, 'Monday, 19 October 2026');
  assert.equal(lifecycleEvents[0].received, '13 Oct 2026 · 09:00 UTC');
});

test('workspace breadth agrees with the enterprise catalog and program figures', () => {
  assert.equal(lifecycleEvents.filter(event => event.type === 'Mover').length, 4);
  assert.equal(lifecycleEvents.filter(event => event.type === 'Joiner').length, 3);
  assert.equal(lifecycleEvents.filter(event => event.type === 'Leaver').length, 2);
  assert.equal(lifecycleEvents.filter(event => event.status === 'Needs decision').length, 1);
  for (const event of lifecycleEvents) assert.ok(identities.some(identity => identity.id === event.identity));
  for (const event of lifecycleEvents.filter(event => event.type === 'Leaver')) {
    const identity = identities.find(person => person.id === event.identity);
    assert.equal(identity.status, 'Inactive');
    assert.deepEqual(identity.access, []);
  }
  assert.equal(workspacePages.applications.rows.length, 12);
  assert.equal(workspacePages.applications.rows.reduce((total, app) => total + app.entitlementCount, 0), 40);
  assert.equal(workspacePages.connectors.rows.length, workspacePages.applications.rows.filter(app => app.mode === 'API').length);
  assert.equal(workspacePages.agents.rows.length, agents.length);
  for (const request of workspacePages.requests.rows) assert.ok(entitlements.some(item => item.name === request.access && item.app === request.appId));
  for (const campaign of workspacePages.certifications.rows) assert.equal(campaign.progress, 100 * campaign.reviewed / campaign.total);
  assert.deepEqual(workspacePages.reports.rows[0], { id: 'REP-MOVERS', name: 'Movers provisioned by effective date', value: '72%', target: '95%+', scope: '2,500 upcoming movers', updated: '13 Oct 2026', definition: 'Percentage of movers provisioned by their effective date across the program.' });
});

test('event status and agent detail permissions follow recorded decisions and execution', () => {
  let state = reduce(initialState(), { type: 'EVALUATE' });
  state = reduce(state, { type: 'ACCEPT_ALL', scope: 'human' });
  state = reduce(state, { type: 'REVIEW', result: 'approved', note: 'Approve after conflicting access is removed.' });
  assert.equal(pageRows('events', state)[0].status, 'Needs decision');
  state = reduce(state, { type: 'ACCEPT_ALL', scope: 'agent' });
  assert.equal(pageRows('events', state)[0].status, 'Ready to apply');
  state = reduce(state, { type: 'APPLY_DECISIONS' });
  assert.equal(pageRows('events', state)[0].status, 'Awaiting effective date');
  state = reduce(state, { type: 'RUN_FULFILLMENT' });
  assert.equal(pageRows('events', state)[0].status, 'Manual task open');
  for (const current of [state, reduce(state, { type: 'COMPLETE_LEGACY', reference: 'DBA-0842', note: 'Removals independently verified.' })]) {
    const agent = pageRows('agents', current)[0];
    assert.deepEqual(agent.resources, agentAccess(current).map(row => row.entitlement));
    assert.equal(agent.permissionCount, agent.resources.length);
    for (const role of pageRows('roles', current)) {
      const membership = identities.filter(identity => (identity.id === 'sarah' ? 'Finance Manager' : identity.role) === role.name).length;
      assert.equal(role.members, membership);
    }
  }
  assert.equal(pageRows('events', reduce(state, { type: 'COMPLETE_LEGACY', reference: 'DBA-0842', note: 'Removals independently verified.' }))[0].status, 'Completed');
});
