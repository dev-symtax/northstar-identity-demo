import { agents, applications, entitlements, identities, movers, policies } from './catalog.js';
import { SCENARIO } from './scenario.js';
import { agentAccess, lifecycleStatus } from '../demo/state.js';

const stamp = '13 Oct 2026 · 09:00 UTC';
export const lifecycleEvents = [
  ...movers.map((event, index) => ({ ...event, name: identities.find(person => person.id === event.identity).name, type: 'Mover', status: index === 0 ? 'Needs decision' : 'Awaiting effective date', received: stamp, source: 'Workday' })),
  ...[9, 15, 21].map((index, offset) => ({ id: `WD-JOIN-2026-0${731 + offset}`, identity: identities[index].id, name: identities[index].name, type: 'Joiner', from: 'New hire', to: identities[index].role, effective: 'Tuesday, 13 October 2026', status: 'Completed', received: '13 Oct 2026 · 08:30 UTC', source: 'Workday' })),
  ...[39, 45].map((index, offset) => ({ id: `WD-LEAVE-2026-0${421 + offset}`, identity: identities[index].id, name: identities[index].name, type: 'Leaver', from: identities[index].role, to: 'Employment ended', effective: 'Tuesday, 13 October 2026', status: 'Completed', received: '13 Oct 2026 · 08:00 UTC', source: 'Workday' })),
];

const requestRows = [
  ['AR-10642', 'Sarah Miller', 'Finance Management Dashboard', 'finance', 'Approved', 'Rachel Morgan'],
  ['AR-10641', 'James Chen', 'ServiceNow Service Desk', 'snow', 'Pending manager', 'Andre Laurent'],
  ['AR-10640', 'Elena Rossi', 'Power BI People Analytics', 'powerbi', 'Provisioned', 'Tim Bennett'],
  ['AR-10639', 'Marcus Johnson', 'Salesforce Sales Manager', 'salesforce', 'Approved', 'Victoria Reed'],
  ['AR-10638', 'Priya Sharma', 'Warehouse Inventory Viewer', 'warehouse', 'Provisioned', 'David Foster'],
  ['AR-10637', 'Oliver Wagner', 'Legal Vault Reader', 'legal', 'Pending manager', 'Helen Park'],
  ['AR-10636', 'Hannah Weber', 'Workday Manager', 'workday', 'Provisioned', 'Rachel Morgan'],
].map(([id, name, access, appId, status, reviewer]) => ({ id, name, access, appId, status, reviewer, received: stamp, source: 'Access catalog' }));

export const workspacePages = {
  events: { title: 'Lifecycle events', eyebrow: 'IDENTITY LIFECYCLE', description: 'Workday lifecycle events and their current access review status.', action: 'Review mover event', columns: [['name', 'Identity'], ['type', 'Event'], ['transition', 'Role change'], ['effective', 'Effective date'], ['status', 'Status']], rows: lifecycleEvents },
  tasks: { title: 'My tasks', eyebrow: 'WORKSPACE', description: 'Approval and review tasks assigned to Patrick Sena.', action: 'Review task', columns: [['name', 'Task'], ['subject', 'Identity / scope'], ['policy', 'Policy'], ['due', 'Due'], ['status', 'Status']], rows: [
    { id: 'TASK-0842', name: 'SAP Payment Approval', subject: 'Sarah Miller', policy: 'POL-RISK-204 · POL-SOD-017', due: '13 Oct 2026', status: 'Needs decision', linkedEvent: 'WD-MOV-2026-0842' },
    { id: 'TASK-0841', name: 'Finance access review', subject: 'Finance department', policy: 'POL-FIN-101', due: '13 Oct 2026', status: 'Completed' },
    { id: 'TASK-0840', name: 'Agent permission review', subject: 'People Services Agent', policy: 'POL-AI-302', due: '13 Oct 2026', status: 'Completed' },
    { id: 'TASK-0839', name: 'Vendor maintenance review', subject: 'SAP S/4HANA', policy: 'POL-SOD-021', due: '13 Oct 2026', status: 'Completed' },
    { id: 'TASK-0838', name: 'Operations access review', subject: 'Operations department', policy: 'POL-SOD-032', due: '13 Oct 2026', status: 'Completed' },
    { id: 'TASK-0837', name: 'Human-only payment control', subject: 'AI agent permissions', policy: 'POL-AI-303', due: '13 Oct 2026', status: 'Completed' },
  ] },
  requests: { title: 'Access requests', eyebrow: 'IDENTITY LIFECYCLE', description: 'Access catalog requests and manager approval status.', action: 'View request', columns: [['id', 'Request'], ['name', 'Identity'], ['access', 'Requested access'], ['appId', 'Application'], ['reviewer', 'Approver'], ['status', 'Status']], rows: requestRows },
  certifications: { title: 'Access certifications', eyebrow: 'IDENTITY LIFECYCLE', description: 'Active certification campaigns with review progress and due dates.', action: 'View campaign', columns: [['name', 'Campaign'], ['scope', 'Scope'], ['owner', 'Owner'], ['progress', 'Progress'], ['due', 'Due date'], ['status', 'Status']], rows: [
    { id: 'CERT-2026-Q4-FIN', name: 'Finance access certification', scope: 'SAP S/4HANA · Finance Hub', appIds: ['sap', 'finance'], owner: 'Patrick Sena', progress: 72, due: '30 Oct 2026', status: 'In review', reviewed: 144, total: 200 },
    { id: 'CERT-2026-Q4-AI', name: 'AI agent permission certification', scope: '4 AI agents', owner: 'Patrick Sena', progress: 75, due: '23 Oct 2026', status: 'In review', reviewed: 3, total: 4 },
    { id: 'CERT-2026-Q4-LEG', name: 'Disconnected application review', scope: 'Legacy Finance DB', appIds: ['legacy'], owner: 'Martin Keller', progress: 60, due: '26 Oct 2026', status: 'In review', reviewed: 12, total: 20 },
    { id: 'CERT-2026-Q4-HR', name: 'HR application access certification', scope: 'Workday', appIds: ['workday'], owner: 'Tim Bennett', progress: 100, due: '13 Oct 2026', status: 'Completed', reviewed: 48, total: 48 },
  ] },
  policies: { title: 'Policies', eyebrow: 'GOVERNANCE', description: 'Active access policies for roles, risk, SoD and AI agents.', action: 'View policy', columns: [['id', 'Policy'], ['name', 'Name'], ['type', 'Type'], ['appId', 'Application'], ['status', 'Status'], ['updated', 'Last updated']], rows: [
    ...policies.map(policy => ({ ...policy, type: policy.id.includes('SOD') ? 'SoD' : policy.id.includes('AI') ? 'Agent' : policy.id.includes('RISK') ? 'Risk' : 'Role', appId: policy.id === 'POL-SOD-032' ? 'warehouse' : policy.id.includes('SOD') || policy.id.includes('RISK') || policy.id === 'POL-AI-303' ? 'sap' : policy.id === 'POL-AI-301' ? null : 'finance', status: 'Active', updated: '13 Oct 2026' })),
    { id: 'POL-ROLE-401', name: 'Manager role assignment', type: 'Role', appId: 'workday', status: 'Active', updated: '13 Oct 2026', description: 'Manager role assignments require an active Workday business role.' },
    { id: 'POL-RISK-205', name: 'Privileged directory access', type: 'Risk', appId: 'entra', status: 'Active', updated: '13 Oct 2026', description: 'Privileged directory access requires a recorded access approval.' },
    { id: 'POL-AI-304', name: 'Agent owner review', type: 'Agent', appId: null, status: 'Active', updated: '13 Oct 2026', description: 'An active human owner must review the agent permission scope.' },
  ] },
  roles: { title: 'Roles', eyebrow: 'GOVERNANCE', description: 'Business roles, membership and governing access policies.', action: 'View role', columns: [['name', 'Business role'], ['department', 'Department'], ['members', 'Members'], ['entitlementCount', 'Entitlements'], ['policy', 'Policy'], ['status', 'Status']], rows: [
    ...['Finance Analyst', 'Finance Manager', 'IT Operations Manager', 'HR Business Partner', 'Sales Manager', 'Operations Manager'].map((name, index) => ({ id: `ROLE-${index + 1}`, name, department: ['Finance', 'Finance', 'IT', 'HR', 'Sales', 'Operations'][index], members: identities.filter(person => person.role === name).length, entitlementCount: index < 2 ? index === 0 ? 5 : 7 : 6, policy: index < 2 ? 'POL-FIN-101' : 'POL-ROLE-401', status: 'Active' })),
  ] },
  agents: { title: 'AI agents', eyebrow: 'GOVERNANCE', description: 'Agent identities, human owners and governed permission scopes.', action: 'View agent', columns: [['name', 'AI agent'], ['owner', 'Owner'], ['permissionCount', 'Permissions'], ['policy', 'Governing policy'], ['status', 'Status']], rows: agents.map(agent => ({ ...agent, permissionCount: agent.resources.length, policy: 'POL-AI-301 · POL-AI-302 · POL-AI-303', status: 'Active' })) },
  applications: { title: 'Applications', eyebrow: 'INTEGRATIONS', description: 'Twelve applications with 40 registered entitlements and assigned provisioning owners.', action: 'View application', columns: [['appId', 'Application'], ['vendor', 'Vendor'], ['provisioning', 'Provisioning'], ['owner', 'Owner'], ['entitlementCount', 'Entitlements'], ['status', 'Status']], rows: applications.map(app => ({ ...app, appId: app.id, vendor: ({ sap: 'SAP', powerbi: 'Microsoft', finance: 'Meridian Global', legacy: 'Meridian Global', workday: 'Workday', entra: 'Microsoft', ad: 'Microsoft', snow: 'ServiceNow', salesforce: 'Salesforce', m365: 'Microsoft', warehouse: 'Meridian Global', legal: 'Meridian Global' })[app.id], provisioning: app.mode === 'API' ? 'Connected · API' : 'Manual', entitlementCount: entitlements.filter(item => item.app === app.id).length, status: 'Active' })) },
  connectors: { title: 'Connectors', eyebrow: 'INTEGRATIONS', description: 'Connector health and last successful synchronization for connected applications.', action: 'View connector', columns: [['appId', 'Application'], ['name', 'Connector'], ['lastSync', 'Last sync'], ['status', 'Health'], ['owner', 'Owner']], rows: applications.filter(app => app.mode === 'API').map(app => ({ id: `CONN-${app.id.toUpperCase()}`, appId: app.id, name: `${app.name} API`, lastSync: stamp, status: 'Healthy', owner: app.owner, authentication: 'Managed service account', schedule: 'Every 15 minutes' })) },
  workday: { title: 'Workday source', eyebrow: 'INTEGRATIONS', description: 'HR source synchronization and the most recent lifecycle events.', action: 'View latest event', columns: [['id', 'Event'], ['name', 'Identity'], ['type', 'Type'], ['received', 'Received'], ['status', 'Status']], rows: lifecycleEvents.slice(0, 6) },
  reports: { title: 'Reports', eyebrow: 'MONITORING', description: 'Program metrics for effective-date provisioning, certifications and connector health.', action: 'View report', columns: [['name', 'Report'], ['value', 'Current value'], ['target', 'Target'], ['scope', 'Scope'], ['updated', 'Updated']], rows: [
    { id: 'REP-MOVERS', name: 'Movers provisioned by effective date', value: '72%', target: '95%+', scope: '2,500 upcoming movers', updated: '13 Oct 2026', definition: 'Percentage of movers provisioned by their effective date across the program.' },
    { id: 'REP-CERT', name: 'Certification review completion', value: '72%', target: '100%', scope: 'Finance access certification', updated: '13 Oct 2026', definition: '144 of 200 access assignments reviewed in the active Finance campaign.' },
    { id: 'REP-CONN', name: 'Connector availability', value: '100%', target: '99.9%', scope: '9 connected applications', updated: '13 Oct 2026', definition: 'All nine registered API connectors reported a successful synchronization.' },
  ] },
  audit: { title: 'Audit trail', eyebrow: 'MONITORING', description: 'Recent lifecycle, approval and connector activity in the workspace.', action: 'View latest event', columns: [['id', 'Record'], ['name', 'Activity'], ['subject', 'Scope'], ['timestamp', 'Timestamp'], ['status', 'Status']], rows: [
    { id: 'AUD-0842', name: 'Workday mover event received', subject: 'Sarah Miller', timestamp: stamp, status: 'Recorded', event: 'WD-MOV-2026-0842' },
    { id: 'AUD-0841', name: 'Workday source synchronized', subject: '48 identity records', timestamp: stamp, status: 'Completed' },
    { id: 'AUD-0840', name: 'HR access certification closed', subject: 'CERT-2026-Q4-HR', timestamp: '13 Oct 2026 · 08:45 UTC', status: 'Completed' },
    { id: 'AUD-0839', name: 'Access request provisioned', subject: 'AR-10640', timestamp: '13 Oct 2026 · 08:40 UTC', status: 'Completed' },
    { id: 'AUD-0838', name: 'Agent owner review recorded', subject: 'People Services Agent', timestamp: '13 Oct 2026 · 08:30 UTC', status: 'Recorded' },
  ] },
};

export function pageRows(key, state) {
  return workspacePages[key].rows.map(row => {
    if (key === 'events' || key === 'workday') return row.identity === 'sarah' ? { ...row, status: lifecycleStatus(state) } : row;
    if (key === 'tasks' && row.id === 'TASK-0842') return { ...row, status: state.review === 'pending' ? 'Needs decision' : state.review === 'approved' ? 'Approved' : 'Denied' };
    if (key === 'roles' && state.fulfillmentStarted && ['Finance Analyst', 'Finance Manager'].includes(row.name)) return { ...row, members: row.members + (row.name === 'Finance Analyst' ? -1 : 1) };
    if (key === 'agents' && row.id === 'finance-agent') {
      const resources = agentAccess(state).map(access => access.entitlement);
      return { ...row, resources, permissionCount: resources.length };
    }
    return row;
  });
}

export const sourceSummary = { status: 'Synchronized', lastSync: stamp, receivedAt: SCENARIO.sourceReceivedLabel, identities: 48, applications: 12, entitlements: 40, agents: 4, movers: 4 };
