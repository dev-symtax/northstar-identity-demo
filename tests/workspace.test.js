import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspacePages, pageRows, lifecycleEvents } from '../src/data/workspace.js';
import { agents, identities, entitlements } from '../src/data/catalog.js';
import { demoReducer as reduce, initialState, agentAccess } from '../src/demo/state.js';

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
