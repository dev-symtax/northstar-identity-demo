import React from 'react';
import { workspacePages } from '../data/workspace.js';
import { decisions, entitlementById } from '../data/catalog.js';
import { actionLabel, getAccessDecision } from '../demo/state.js';
import { ApplicationName } from './ApplicationIcon.jsx';
import { AgentName, Badge, Drawer, Field } from './UI.jsx';

const rules = {
  'POL-FIN-101': 'Access must match Sarah’s target Finance Manager role; unrelated operational access is removed.',
  'POL-RISK-204': 'SAP Payment Approval requires Patrick Sena’s explicit approval and a recorded comment before activation.',
  'POL-SOD-017': 'Accounts Receivable Operator and SAP Payment Approval must not be active together. Remove receivables access before activating payment approval, or withhold payment approval.',
  'POL-SOD-021': 'Vendor Master Maintenance and SAP Payment Approval require separate duties.',
  'POL-SOD-032': 'Warehouse Inventory Operator and Warehouse Dispatch Approval require separate duties.',
  'POL-AI-301': 'Sarah must remain eligible to use the approved Finance Operations Agent under her business role.',
  'POL-AI-302': 'Each agent permission is evaluated independently against the owner’s business role. Human approvals are not inherited.',
  'POL-AI-303': 'Payment approval is restricted to human identities and cannot be overridden for an AI agent.',
};

export default function PolicyDetails({ policyId, row, decision, state, onClose }) {
  const policy = workspacePages.policies.rows.find(item => item.id === policyId);
  if (!policy) return null;
  const appId = row?.entitlement ? entitlementById[row.entitlement].app : policy.appId;
  let result = decision?.decidedAction ? `${actionLabel(decision.decidedAction)} · ${decision.status}` : 'Awaiting an access decision';
  if (policyId === 'POL-AI-303') result = 'Not permitted by policy · Payment approval remains unavailable to the Finance Operations Agent.';
  if (policyId === 'POL-SOD-017') {
    const payment = getAccessDecision(decisions.find(item => item.id === 'h-payment'), state);
    const receivables = getAccessDecision(decisions.find(item => item.id === 'h-ar'), state);
    result = payment.decidedAction === 'DO_NOT_GRANT' ? 'Satisfied · Payment approval is withheld.'
      : payment.decidedAction === 'GRANT' && receivables.decidedAction === 'REMOVE'
        ? state.tasks['h-ar']?.status === 'Removed' ? 'Satisfied · Receivables access was removed before payment approval was activated.' : 'Approved with condition · Receivables access must be removed before payment approval is activated.'
        : 'Requires review · Resolve the receivables / payment conflict before applying decisions.';
  }
  return <Drawer title={policy.name} subtitle={`POLICY · ${policy.id}`} onClose={onClose} preserveScroll>
    {appId && <div className="drawer-application"><ApplicationName appId={appId} /></div>}
    <dl><Field label="Policy ID">{policy.id}</Field><Field label="Policy name">{policy.name}</Field><Field label="Policy type">{policy.type}</Field><Field label="Status"><Badge>{policy.status}</Badge></Field><Field label="Description">{policy.description}</Field><Field label="Condition / rule">{rules[policyId] || policy.description}</Field>{row && <><Field label="Decision identity">{row.scope === 'human' ? 'Sarah Miller' : row.scope === 'inbound' ? 'Sarah Miller · Agent usage' : <AgentName />}</Field><Field label="Result for this decision">{result}</Field></>}</dl>
  </Drawer>;
}
