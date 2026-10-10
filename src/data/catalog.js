import { SCENARIO } from './scenario.js';

export const applications = [
  { id: 'sap', name: 'SAP S/4HANA', category: 'Finance', owner: 'Finance Platforms', mode: 'API', criticality: 'Critical' },
  { id: 'powerbi', name: 'Power BI', category: 'Analytics', owner: 'Data & Analytics', mode: 'API', criticality: 'Standard' },
  { id: 'finance', name: 'Finance Hub', category: 'Finance', owner: 'Finance Operations', mode: 'API', criticality: 'High' },
  { id: 'legacy', name: 'Legacy Finance DB', category: 'Finance', owner: 'Martin Keller', mode: 'Controlled task', criticality: 'Critical' },
  { id: 'workday', name: 'Workday', category: 'Human resources', owner: 'HR Operations', mode: 'API', criticality: 'High' },
  { id: 'entra', name: 'Microsoft Entra ID', category: 'Directory', owner: 'Identity Engineering', mode: 'API', criticality: 'Critical' },
  { id: 'ad', name: 'Active Directory', category: 'Directory', owner: 'Infrastructure', mode: 'API', criticality: 'High' },
  { id: 'snow', name: 'ServiceNow', category: 'IT service management', owner: 'IT Operations', mode: 'API', criticality: 'Standard' },
  { id: 'salesforce', name: 'Salesforce', category: 'Sales', owner: 'Revenue Operations', mode: 'API', criticality: 'High' },
  { id: 'm365', name: 'Microsoft 365', category: 'Collaboration', owner: 'Digital Workplace', mode: 'API', criticality: 'Standard' },
  { id: 'warehouse', name: 'Warehouse Operations', category: 'Operations', owner: 'Supply Chain IT', mode: 'Controlled task', criticality: 'High' },
  { id: 'legal', name: 'Legal Document Vault', category: 'Legal', owner: 'Legal Operations', mode: 'API', criticality: 'High' },
];

const permissionSeeds = [
  ['sap-view', 'SAP FI Viewer', 'sap', 'Standard'],
  ['powerbi-fin', 'Power BI Finance', 'powerbi', 'Standard'],
  ['ar-operator', 'Accounts Receivable Operator', 'sap', 'High'],
  ['legacy-write', 'Legacy Finance DB Write', 'legacy', 'High'],
  ['finance-dashboard', 'Finance Management Dashboard', 'finance', 'Standard'],
  ['budget-approval', 'Budget Approval', 'finance', 'High'],
  ['payment-approval', 'SAP Payment Approval', 'sap', 'High'],
  ['sap-vendor', 'Vendor Master Maintenance', 'sap', 'High'],
  ['sap-audit', 'SAP Audit Reports', 'sap', 'Standard'],
  ['powerbi-ops', 'Power BI Operations', 'powerbi', 'Standard'],
  ['powerbi-author', 'Power BI Report Author', 'powerbi', 'Standard'],
  ['powerbi-hr', 'Power BI People Analytics', 'powerbi', 'High'],
  ['finance-reports', 'Finance Reporting Data', 'finance', 'Standard'],
  ['finance-read', 'Finance Hub Reader', 'finance', 'Standard'],
  ['legacy-read', 'Legacy Finance DB Read', 'legacy', 'Standard'],
  ['legacy-admin', 'Legacy Finance DB Administration', 'legacy', 'High'],
  ['wd-profile', 'Workday Employee Self Service', 'workday', 'Standard'],
  ['wd-manager', 'Workday Manager', 'workday', 'Standard'],
  ['wd-payroll', 'Workday Payroll Administration', 'workday', 'High'],
  ['wd-hr', 'Workday HR Partner', 'workday', 'High'],
  ['entra-user', 'Entra Workforce User', 'entra', 'Standard'],
  ['entra-admin', 'Entra Privileged Role Administrator', 'entra', 'High'],
  ['entra-support', 'Entra Helpdesk Administrator', 'entra', 'Standard'],
  ['ad-user', 'AD Standard User', 'ad', 'Standard'],
  ['ad-admin', 'AD Domain Administrator', 'ad', 'High'],
  ['ad-ops', 'AD Operations Group', 'ad', 'Standard'],
  ['snow-user', 'Employee Self Service', 'snow', 'Standard'],
  ['snow-agent', 'ServiceNow Service Desk', 'snow', 'Standard'],
  ['snow-change', 'Finance Request Approver', 'snow', 'High'],
  ['sf-sales', 'Salesforce Sales User', 'salesforce', 'Standard'],
  ['sf-manager', 'Salesforce Sales Manager', 'salesforce', 'Standard'],
  ['sf-export', 'Salesforce Data Export', 'salesforce', 'High'],
  ['m365-user', 'Microsoft 365 Business User', 'm365', 'Standard'],
  ['m365-admin', 'Microsoft 365 Global Administrator', 'm365', 'High'],
  ['m365-team', 'Teams Workspace Owner', 'm365', 'Standard'],
  ['wh-read', 'Warehouse Inventory Viewer', 'warehouse', 'Standard'],
  ['wh-write', 'Warehouse Inventory Operator', 'warehouse', 'High'],
  ['wh-approve', 'Warehouse Dispatch Approval', 'warehouse', 'High'],
  ['legal-read', 'Legal Vault Reader', 'legal', 'Standard'],
  ['legal-owner', 'Legal Vault Matter Owner', 'legal', 'High'],
];
export const entitlements = permissionSeeds.map(([id, name, app, risk]) => ({ id, name, app, risk }));
export const entitlementById = Object.fromEntries(entitlements.map(e => [e.id, e]));
export const applicationById = Object.fromEntries(applications.map(a => [a.id, a]));

const peopleNames = ['Sarah Miller', 'James Chen', 'Elena Rossi', 'Marcus Johnson', 'Priya Sharma', 'Oliver Wagner', 'Sofia Garcia', 'Daniel Brooks', 'Amara Okafor', 'Lucas Martin', 'Hannah Weber', 'Ethan Taylor', 'Isabella Costa', 'Noah Williams', 'Maya Patel', 'Alexander Schmidt', 'Chloe Dubois', 'Benjamin Davis', 'Ava Thompson', 'Liam Wilson', 'Nina Fischer', 'Samuel Lee', 'Emma Brown', 'David Nguyen', 'Leila Hassan', 'Thomas Anderson', 'Julia Becker', 'Michael Clark', 'Yuki Tanaka', 'Gabriel Santos', 'Alice Moreau', 'William Harris', 'Zara Ahmed', 'Felix Hoffmann', 'Charlotte Lewis', 'Henry Robinson', 'Anika Mehta', 'Oscar Lindberg', 'Camille Laurent', 'Jack Turner', 'Freya Nielsen', 'Leo Martinez', 'Grace Kim', 'Adam Kowalski', 'Eva Novak', 'Nathan White', 'Clara Schneider', 'Ryan Mitchell'];
const departments = ['Finance', 'IT', 'HR', 'Sales', 'Operations', 'Legal'];
const roles = { Finance: ['Finance Analyst', 'Finance Manager'], IT: ['Service Desk Analyst', 'IT Operations Manager'], HR: ['HR Specialist', 'HR Business Partner'], Sales: ['Account Executive', 'Sales Manager'], Operations: ['Operations Analyst', 'Operations Manager'], Legal: ['Legal Analyst', 'Legal Counsel'] };
const departmentAccess = { Finance: ['sap-view', 'powerbi-fin'], IT: ['snow-agent', 'entra-support'], HR: ['wd-hr', 'powerbi-hr'], Sales: ['sf-sales', 'powerbi-author'], Operations: ['wh-read', 'powerbi-ops'], Legal: ['legal-read', 'm365-team'] };
export const identities = peopleNames.map((name, index) => {
  const department = departments[index % departments.length];
  return {
    id: index === 0 ? 'sarah' : `identity-${index + 1}`,
    name, department, role: roles[department][index % 4 === 0 ? 1 : 0],
    location: ['London, UK', 'New York, US', 'Frankfurt, DE', 'Toronto, CA', 'Paris, FR', 'Chicago, US'][index % 6],
    manager: ['Rachel Morgan', 'Andre Laurent', 'Tim Bennett', 'Victoria Reed', 'David Foster', 'Helen Park'][index % 6],
    employeeId: `MG-${String(10482 + index).padStart(6, '0')}`,
    access: [...departmentAccess[department], 'wd-profile', 'entra-user', 'm365-user', 'snow-user'],
    status: 'Active',
  };
});
Object.assign(identities[0], { role: 'Finance Analyst', manager: 'Rachel Morgan', access: ['sap-view', 'powerbi-fin', 'ar-operator', 'legacy-write', 'snow-user'] });
// The completed leaver events retain their identity records for audit, with
// inactive accounts and no remaining application access.
for (const index of [39, 45]) Object.assign(identities[index], { status: 'Inactive', access: [] });
export const agents = [
  { id: 'finance-agent', name: 'Finance Operations Agent', owner: 'Sarah Miller', purpose: 'Finance reporting and operational assistance', departments: ['Finance'], resources: ['powerbi-fin', 'finance-reports', 'ar-operator', 'legacy-write'], autonomy: 'Controlled' },
  { id: 'hr-agent', name: 'People Services Agent', owner: 'Tim Bennett', purpose: 'Employee policy and HR case assistance', departments: ['HR'], resources: ['wd-profile', 'wd-hr'], autonomy: 'Read only' },
  { id: 'it-agent', name: 'IT Resolution Agent', owner: 'Andre Laurent', purpose: 'Service desk triage and approved remediation', departments: ['IT'], resources: ['snow-agent', 'entra-support'], autonomy: 'Controlled' },
  { id: 'sales-agent', name: 'Revenue Insights Agent', owner: 'Victoria Reed', purpose: 'Sales forecasting and account insights', departments: ['Sales'], resources: ['sf-sales', 'powerbi-author'], autonomy: 'Read only' },
];
export const movers = [
  { id: 'WD-MOV-2026-0842', identity: 'sarah', from: 'Finance Analyst', to: 'Finance Manager', effective: SCENARIO.effectiveDate, status: 'Recommendations ready' },
  { id: 'WD-MOV-2026-0843', identity: 'identity-2', from: 'Service Desk Analyst', to: 'IT Operations Manager', effective: 'Tuesday, 20 October 2026', status: 'In review' },
  { id: 'WD-MOV-2026-0844', identity: 'identity-3', from: 'HR Specialist', to: 'HR Business Partner', effective: 'Wednesday, 21 October 2026', status: 'Scheduled' },
  { id: 'WD-MOV-2026-0845', identity: 'identity-4', from: 'Account Executive', to: 'Sales Manager', effective: 'Friday, 23 October 2026', status: 'Recommendations ready' },
];
for (const mover of movers.slice(1)) identities.find(i => i.id === mover.identity).role = mover.from;

export const policies = [
  { id: 'POL-FIN-101', name: 'Finance role alignment', description: 'Re-evaluate Finance access against the target business role.' },
  { id: 'POL-RISK-204', name: 'High-risk payment approval', description: 'Payment approval requires an explicit identity governance approval.' },
  { id: 'POL-SOD-017', name: 'Receivables / payment separation', description: 'Accounts Receivable Operator and SAP Payment Approval must not be active together.', conflict: ['ar-operator', 'payment-approval'] },
  { id: 'POL-SOD-021', name: 'Vendor / payment separation', description: 'Vendor maintenance and payment approval require separate duties.', conflict: ['sap-vendor', 'payment-approval'] },
  { id: 'POL-SOD-032', name: 'Inventory / dispatch separation', description: 'Inventory adjustment and dispatch approval require separate duties.', conflict: ['wh-write', 'wh-approve'] },
  { id: 'POL-AI-301', name: 'Approved agent eligibility', description: 'Finance roles may use the approved Finance Operations Agent.' },
  { id: 'POL-AI-302', name: 'Agent permission boundaries', description: 'Agent permissions must independently fit the owner’s business role.' },
  { id: 'POL-AI-303', name: 'Human-only payment control', description: 'Payment approval is restricted to human identities (POL-AI-303).' },
];

const rows = [
  ['h-sap', 'human', 'sap-view', 'KEEP', 'POL-FIN-101', 'Finance reporting remains necessary in the manager role.'],
  ['h-bi', 'human', 'powerbi-fin', 'KEEP', 'POL-FIN-101', 'Financial analysis remains part of Sarah’s responsibilities.'],
  ['h-dashboard', 'human', 'finance-dashboard', 'GRANT', 'POL-FIN-101', 'Management reporting is required for the new role.'],
  ['h-budget', 'human', 'budget-approval', 'GRANT', 'POL-FIN-101', 'Budget accountability is a defined Finance Manager responsibility.'],
  ['h-ar', 'human', 'ar-operator', 'REMOVE', 'POL-FIN-101', 'Receivables operations no longer fit the manager role.'],
  ['h-legacy', 'human', 'legacy-write', 'REMOVE', 'POL-FIN-101', 'Direct database writes are outside the manager’s responsibilities.'],
  ['h-payment', 'human', 'payment-approval', 'REVIEW', 'POL-RISK-204', 'Explicit approval is required; receivables access must be removed before activation.'],
  ['h-snow-self', 'human', 'snow-user', 'KEEP', 'POL-FIN-101', 'Employee self service remains necessary in Sarah’s manager role.'],
  ['h-snow-approver', 'human', 'snow-change', 'GRANT', 'POL-FIN-101', 'Finance Managers approve finance service requests within their business scope.'],
  ['a-inbound', 'inbound', null, 'KEEP', 'POL-AI-301', 'Finance Managers remain eligible to use the approved agent.'],
  ['a-bi', 'outbound', 'powerbi-fin', 'KEEP', 'POL-AI-302', 'Finance analysis remains appropriate for the agent.'],
  ['a-reports', 'outbound', 'finance-reports', 'KEEP', 'POL-AI-302', 'Read-only finance reporting remains appropriate for the owner’s new role.'],
  ['a-dashboard', 'outbound', 'finance-dashboard', 'GRANT', 'POL-AI-302', 'Management reporting is allowed for the owner’s new role.'],
  ['a-ar', 'outbound', 'ar-operator', 'REMOVE', 'POL-AI-302', 'The agent may no longer operate receivables on Sarah’s behalf.'],
  ['a-legacy', 'outbound', 'legacy-write', 'REMOVE', 'POL-AI-302', 'Agent legacy writes must be removed alongside the owner’s access.'],
  ['a-payment', 'outbound', 'payment-approval', 'NOT_PERMITTED', 'POL-AI-303', 'Payment approval is restricted to human identities (POL-AI-303).'],
];
export const decisions = rows.map(([id, scope, entitlement, recommendedAction, policyId, reason]) => ({
  id, scope, entitlement, recommendedAction, policyId, reason,
  decision: recommendedAction, policy: policyId, why: reason,
}));
export function resourceName(row) { return row.entitlement ? entitlementById[row.entitlement].name : 'Finance Operations Agent'; }
export function subjectName(row) { return row.scope === 'outbound' ? 'Finance Operations Agent on behalf of Sarah Miller' : 'Sarah Miller'; }
