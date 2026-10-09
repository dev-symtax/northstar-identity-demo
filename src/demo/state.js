import { decisions } from '../data/catalog.js';
import { REVIEWER, SCENARIO } from '../data/scenario.js';

export const STORAGE_KEY = 'northstar-identity-demo-v1';
export const initialState = () => ({
  version: 1, evaluated: false, review: 'pending', reviewNote: '', fulfillmentStarted: false,
  tasks: {}, decisionEvidence: [], fulfillmentEvidence: [], actionCount: 0, actions: [],
});

function executionTimestamp(state) {
  return new Date(Date.parse(SCENARIO.fulfillmentAt) + state.actionCount * 60000).toISOString();
}
function decisionRecord(row, decision, at, actor, why = row.why) {
  return { id: `DE-${row.id}-${decision}`, rowId: row.id, eventId: 'WD-MOV-2026-0842', actor, decision, why, policy: row.policy, timestamp: at };
}
function executionRecord(row, status, at, extra = {}) {
  return { id: `FE-${row.id}-${status}`, rowId: row.id, eventId: 'WD-MOV-2026-0842', status, timestamp: at, ...extra };
}
function reduceState(state, action) {
  if (action.type === 'RESET') return initialState();
  if (action.type === 'EVALUATE') {
    if (state.evaluated) return state;
    return { ...state, evaluated: true, actionCount: state.actionCount + 1,
      decisionEvidence: decisions.map(row => decisionRecord(row, row.decision, SCENARIO.receivedAt, 'Northstar policy evaluation')) };
  }
  if (action.type === 'REVIEW') {
    if (!state.evaluated || state.review !== 'pending' || !['approved', 'rejected'].includes(action.result) || !action.note?.trim()) return state;
    const row = decisions.find(d => d.id === 'h-payment');
    const next = { ...state, review: action.result, reviewNote: action.note.trim(), actionCount: state.actionCount + 1,
      decisionEvidence: [...state.decisionEvidence, decisionRecord(row, action.result === 'approved' ? 'APPROVED' : 'DENIED', SCENARIO.approvalAt, `${REVIEWER.name} · ${REVIEWER.role}`, action.note.trim())] };
    // A late approval is eligible for a subsequent execution only after SoD removal.
    if (state.fulfillmentStarted) {
      next.tasks = { ...state.tasks, 'h-payment': { status: action.result === 'approved' ? 'Ready to execute' : 'Not granted' } };
      if (action.result === 'rejected') next.fulfillmentEvidence = [...state.fulfillmentEvidence, executionRecord(row, 'Not granted', executionTimestamp(state), { method: 'Grant withheld after reviewer denial', owner: 'Identity Operations', sla: 'Not applicable', reference: 'REVIEW-0842-DENIED' })];
    }
    return next;
  }
  if (action.type === 'RUN_FULFILLMENT') {
    if (!state.evaluated) return state;
    const tasks = { ...state.tasks };
    const evidence = [...state.fulfillmentEvidence];
    let changed = !state.fulfillmentStarted;
    // Revoke incompatible operational access before granting payment approval.
    const ordered = [...decisions].sort((a, b) => (a.decision === 'REMOVE' ? -1 : 0) - (b.decision === 'REMOVE' ? -1 : 0));
    ordered.forEach((row, index) => {
      const at = new Date(Date.parse(SCENARIO.fulfillmentAt) + (state.fulfillmentStarted ? state.actionCount * 60000 : 0) + index * 1000).toISOString();
      const existing = tasks[row.id];
      if (existing && !['Awaiting approval', 'Ready to execute'].includes(existing.status)) return;
      if (existing?.status === 'Awaiting approval' && state.review === 'pending') return;
      changed = true;
      if (row.decision === 'KEEP') {
        tasks[row.id] = { status: 'Retained' };
        evidence.push(executionRecord(row, 'Retained', at, { method: 'Existing access verified', owner: 'Identity Operations', sla: 'No change required', reference: `VERIFY-${row.id}` }));
      } else if (row.decision === 'BLOCK') {
        tasks[row.id] = { status: 'Blocked' };
        evidence.push(executionRecord(row, 'Blocked', at, { method: 'Delegation policy enforcement', owner: 'AI Governance', sla: 'Effective immediately', reference: 'CONTROL-AI-303-0842' }));
      } else if (row.id === 'h-payment' && state.review !== 'approved') {
        tasks[row.id] = { status: state.review === 'rejected' ? 'Not granted' : 'Awaiting approval' };
        if (state.review === 'rejected') evidence.push(executionRecord(row, 'Not granted', at, { method: 'Grant withheld after reviewer denial', owner: 'Identity Operations', sla: 'Not applicable', reference: 'REVIEW-0842-DENIED' }));
      } else if (row.entitlement === 'legacy-write') {
        tasks[row.id] = { status: 'Task open' };
        evidence.push(executionRecord(row, 'Task open', at, { method: 'Controlled manual task', owner: 'Martin Keller · Finance Platforms', sla: SCENARIO.legacyDue, reference: 'SN-TASK-004812' }));
      } else {
        if (row.id === 'h-payment' && tasks['h-ar']?.status !== 'Removed') return;
        const status = row.decision === 'REMOVE' ? 'Removed' : 'Granted';
        tasks[row.id] = { status };
        evidence.push(executionRecord(row, status, at, { method: row.scope === 'outbound' ? 'Delegated permission API' : 'Application connector API', owner: 'Identity Operations', sla: 'Effective date · 08:00 UTC', reference: `API-0842-${row.id.toUpperCase()}` }));
      }
    });
    return changed ? { ...state, fulfillmentStarted: true, tasks, fulfillmentEvidence: evidence, actionCount: state.actionCount + 1 } : state;
  }
  if (action.type === 'COMPLETE_LEGACY') {
    if (!state.fulfillmentStarted || state.tasks['h-legacy']?.status !== 'Task open' || !action.reference?.trim() || !action.note?.trim()) return state;
    const tasks = { ...state.tasks };
    const records = ['h-legacy', 'a-legacy'].map(id => {
      tasks[id] = { status: 'Removed' };
      return executionRecord(decisions.find(d => d.id === id), 'Removed', executionTimestamp(state), {
        method: 'DBA revocation + delegated access verification', owner: 'Martin Keller · Finance Platforms',
        sla: SCENARIO.legacyDue, reference: action.reference.trim(), note: action.note.trim(), task: 'SN-TASK-004812',
      });
    });
    return { ...state, tasks, actionCount: state.actionCount + 1, fulfillmentEvidence: [...state.fulfillmentEvidence, ...records] };
  }
  return state;
}

export function demoReducer(state, action) {
  const next = reduceState(state, action);
  if (action.type === 'RESET') return next;
  if (next === state) return state;
  const savedAction = { type: action.type };
  if (action.type === 'REVIEW') Object.assign(savedAction, { result: action.result, note: action.note.trim() });
  if (action.type === 'COMPLETE_LEGACY') Object.assign(savedAction, { reference: action.reference.trim(), note: action.note.trim() });
  return { ...next, actions: [...state.actions, savedAction] };
}

export function effectiveDecision(row, state) {
  if (row.id === 'h-payment' && state.review !== 'pending') return state.review === 'approved' ? 'APPROVED' : 'DENIED';
  return row.decision;
}
export function fulfillmentStatus(row, state) {
  if (state.tasks[row.id]) return state.tasks[row.id].status;
  if (!state.evaluated) return 'Not evaluated';
  if (row.decision === 'KEEP') return 'No change required';
  if (row.decision === 'BLOCK') return 'Policy guardrail';
  if (row.id === 'h-payment') return state.review === 'pending' ? 'Awaiting approval' : state.review === 'rejected' ? 'Not granted' : 'Scheduled';
  return 'Scheduled';
}
export function readiness(state) {
  const required = ['h-dashboard', 'h-budget', 'a-dashboard'];
  return state.fulfillmentStarted && required.every(id => state.tasks[id]?.status === 'Granted');
}
export function controlComplete(state) {
  return state.fulfillmentStarted && ['h-ar', 'h-legacy', 'a-ar', 'a-legacy'].every(id => state.tasks[id]?.status === 'Removed');
}
export function humanAccess(state) {
  const current = ['sap-view', 'powerbi-fin', 'ar-operator', 'legacy-write'];
  const rows = decisions.filter(d => d.scope === 'human');
  return rows.filter(row => current.includes(row.entitlement) ? state.tasks[row.id]?.status !== 'Removed' : state.tasks[row.id]?.status === 'Granted');
}
export function agentAccess(state) {
  return decisions.filter(row => row.scope === 'outbound' && (['powerbi-fin', 'finance-reports', 'ar-operator', 'legacy-write'].includes(row.entitlement) ? state.tasks[row.id]?.status !== 'Removed' : state.tasks[row.id]?.status === 'Granted'));
}
export function restoreState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.actions) || saved.actions.length > 10) return initialState();
    // Restore only supported actions. Derived access and audit records are rebuilt deterministically.
    let replay = initialState();
    for (const action of saved.actions) {
      if (!action || !['EVALUATE', 'REVIEW', 'RUN_FULFILLMENT', 'COMPLETE_LEGACY'].includes(action.type)) return initialState();
      if (action.type === 'REVIEW' && (typeof action.note !== 'string' || action.note.length > 3000)) return initialState();
      if (action.type === 'COMPLETE_LEGACY' && (typeof action.reference !== 'string' || typeof action.note !== 'string' || action.reference.length > 160 || action.note.length > 1500)) return initialState();
      const next = demoReducer(replay, action);
      if (next === replay) return initialState();
      replay = next;
    }
    return replay;
  } catch { return initialState(); }
}
