import { decisions, applicationById, entitlementById, identities } from '../data/catalog.js';
import { LEGACY_TASK, REVIEWER, SCENARIO } from '../data/scenario.js';

export const STORAGE_KEY = 'northstar-identity-demo-v1';
const STATE_VERSION = 4;
const ACTIONS = ['KEEP', 'GRANT', 'REMOVE', 'REVIEW', 'NOT_PERMITTED', 'DO_NOT_GRANT'];
const REVIEWER_LABEL = `${REVIEWER.name} · ${REVIEWER.role}`;
const SYSTEM_ACTOR = 'Northstar policy engine';
const EVENT_ID = 'WD-MOV-2026-0842';
export const PAYMENT_CONDITION = 'Approved · Activates after conflicting access is removed';
export const SOD_MESSAGE = 'POL-SOD-017 prevents Accounts Receivable Operator and SAP Payment Approval from being active together.';
const PAYMENT_ROW = decisions.find(row => row.id === 'h-payment');
const AR_ROW = decisions.find(row => row.id === 'h-ar');

export function sodDependency(state) {
  const required = getAccessDecision(PAYMENT_ROW, state).decidedAction === 'GRANT';
  return { required, conflict: required && getAccessDecision(AR_ROW, state).decidedAction !== 'REMOVE' };
}
export function paymentActivationAllowed(tasks) {
  return tasks[AR_ROW.id]?.status === 'Removed';
}
function sodEvidence(required) {
  return {
    policyId: 'POL-SOD-017', conflictingEntitlement: 'Accounts Receivable Operator',
    conflictingRowId: AR_ROW.id, requiredAction: required ? 'REMOVE' : null, required,
    resolution: required ? 'Remove Accounts Receivable Operator before activating SAP Payment Approval.' : 'SAP Payment Approval denied; Accounts Receivable Operator may remain active.',
    summary: required
      ? 'SAP Payment Approval approved conditionally. Accounts Receivable Operator removal required by POL-SOD-017 before activation.'
      : 'SAP Payment Approval denied. POL-SOD-017 conflict resolved; Accounts Receivable Operator may remain active.',
  };
}

export const initialState = () => ({
  version: STATE_VERSION, evaluated: false, applied: false, review: 'pending', reviewNote: '',
  fulfillmentStarted: false, accessDecisions: {}, tasks: {}, decisionEvidence: [],
  fulfillmentEvidence: [], manualFulfillmentEvidence: [], lifecycleEvidence: [], legacyTask: null, actionCount: 0, actions: [],
});

function recommendation(row) {
  return {
    recommendedAction: row.recommendedAction, policyId: row.policyId, reason: row.reason,
    decidedAction: null, status: row.recommendedAction === 'REVIEW' ? 'Needs review' : 'Recommended',
    decidedBy: null, decidedAt: null, comment: '', decisionSource: 'undecided',
  };
}
export function getAccessDecision(row, state) {
  return state.accessDecisions?.[row.id] || recommendation(row);
}
export function isUndecidedRecommendation(access) {
  return access.decisionSource === 'undecided' && access.decidedAction === null
    && !['REVIEW', 'NOT_PERMITTED'].includes(access.recommendedAction);
}
export function actionLabel(action) {
  return { KEEP: 'Keep', GRANT: 'Grant', REMOVE: 'Remove', REVIEW: 'Review',
    NOT_PERMITTED: 'Not permitted by policy', DO_NOT_GRANT: 'Do not grant' }[action] || 'Not decided';
}
function decisionRecord(row, model, sequence, at = model.decidedAt || SCENARIO.receivedAt) {
  return {
    id: `DE-${row.id}-${sequence}`, rowId: row.id, eventId: EVENT_ID,
    actor: model.decidedBy || SYSTEM_ACTOR, decision: model.decidedAction || model.recommendedAction,
    why: model.reason, policy: model.policyId, timestamp: at, ...model,
  };
}
function executionRecord(row, status, at, extra = {}) {
  return { id: `FE-${row.id}-${status}`, rowId: row.id, eventId: EVENT_ID, status, timestamp: at, ...extra };
}
function manualObligation() {
  return { method: LEGACY_TASK.method, owner: LEGACY_TASK.owner, task: LEGACY_TASK.id,
    application: LEGACY_TASK.application, target: LEGACY_TASK.resource,
    due: SCENARIO.legacyDue, dueAt: SCENARIO.legacyDueAt, status: 'Scheduled' };
}
function manualTaskRecord(rows, stage, timestamp, extra = {}) {
  return {
    id: `MF-${LEGACY_TASK.id}-${stage}`, eventId: EVENT_ID, category: 'Controlled task', eventType: 'Manual fulfillment', stage,
    actor: LEGACY_TASK.owner, owner: LEGACY_TASK.owner, method: LEGACY_TASK.method,
    applicationId: LEGACY_TASK.applicationId, application: LEGACY_TASK.application, target: LEGACY_TASK.resource,
    entitlement: 'legacy-write', resource: LEGACY_TASK.resource, task: LEGACY_TASK.id,
    due: SCENARIO.legacyDue, dueAt: SCENARIO.legacyDueAt, timestamp, rowIds: rows.map(row => row.id), ...extra,
  };
}
function recordLifecycleCompletion(state, timestamp) {
  if (!controlComplete(state) || state.lifecycleEvidence.length) return state;
  return { ...state, lifecycleEvidence: [{
    id: 'LE-0842-completed', eventId: EVENT_ID, identity: 'Sarah Miller',
    status: 'Completed', actor: SYSTEM_ACTOR, timestamp,
    reason: 'All applied access changes and required manual removals are verified.',
    ...(state.fulfillmentEvidence.some(record => record.task === 'SN-TASK-004812') ? { task: 'SN-TASK-004812' } : {}),
  }] };
}
function decisionFor(row, action, comment = '', decisionSource = action === row.recommendedAction ? 'accepted-recommendation' : 'manual-override') {
  return {
    ...recommendation(row), decidedAction: action,
    status: row.recommendedAction === 'REVIEW' || action === row.recommendedAction ? 'Accepted' : 'Changed',
    decidedBy: REVIEWER_LABEL, decidedAt: SCENARIO.approvalAt, comment, decisionSource,
  };
}
function recordDecisions(state, changes, extra = {}) {
  const accessDecisions = { ...state.accessDecisions };
  const records = changes.map(([row, model], index) => {
    accessDecisions[row.id] = model;
    return decisionRecord(row, model, `${state.actionCount + 1}-${index}`);
  });
  return { ...state, ...extra, accessDecisions, decisionEvidence: [...state.decisionEvidence, ...records], actionCount: state.actionCount + 1 };
}
function editable(state) { return state.evaluated && !state.applied; }
function validComment(value, required = false) {
  return typeof value === 'string' && value.length <= 3000 && (!required || Boolean(value.trim()));
}
function reviewDecision(state, result, note) {
  if (!editable(state) || !['approved', 'rejected'].includes(result) || !validComment(note, true)) return state;
  const ar = getAccessDecision(AR_ROW, state);
  if (result === 'approved' && ar.decidedAction === 'KEEP') return state;
  const row = PAYMENT_ROW;
  const required = result === 'approved';
  const model = { ...decisionFor(row, required ? 'GRANT' : 'DO_NOT_GRANT', note.trim(), 'high-risk-review'), sod: sodEvidence(required) };
  const previous = getAccessDecision(row, state);
  if (state.review === result && previous.comment === model.comment) return state;
  const changes = [[row, model]];
  if (required) {
    // Keep existing removal decisions and rationale; only an undecided removal
    // becomes a new decision required by the explicitly approved dependency.
    changes.push([AR_ROW, { ...(ar.decidedAction === 'REMOVE' ? ar : decisionFor(AR_ROW, 'REMOVE', '', 'policy-required')), sod: sodEvidence(true) }]);
  } else if (ar.sod?.required) {
    // Release a removal selected solely for payment approval back to its role
    // recommendation. Independently recorded removals remain the user's choice.
    changes.push([AR_ROW, { ...(ar.decisionSource === 'policy-required' ? recommendation(AR_ROW) : ar), sod: sodEvidence(false) }]);
  }
  return recordDecisions(state, changes, { review: result, reviewNote: model.comment });
}
export function canApplyDecisions(state) {
  if (!state.evaluated || state.applied || state.review === 'pending') return false;
  if (!decisions.every(row => getAccessDecision(row, state).decidedAction !== null)) return false;
  return !sodDependency(state).conflict;
}
export function decisionSummary(state, { scope, includeUndecided = false } = {}) {
  const byAction = Object.fromEntries(ACTIONS.map(action => [action, 0]));
  const decidedByAction = { ...byAction };
  const applications = new Map();
  const rows = decisions.filter(row => !scope || (scope === 'human' ? row.scope === 'human' : row.scope !== 'human'));
  let decided = 0;
  for (const row of rows) {
    const chosen = getAccessDecision(row, state).decidedAction;
    if (chosen) { decided += 1; decidedByAction[chosen] += 1; }
    const action = chosen || (includeUndecided ? effectiveDecision(row, state) : null);
    if (!action) continue;
    byAction[action] += 1;
    const appId = row.entitlement ? entitlementById[row.entitlement].app : null;
    const application = appId ? applicationById[appId].name : 'Finance Operations Agent';
    const group = applications.get(application) || { application, name: application, appId, count: 0, counts: {} };
    group.count += 1;
    group.counts[action] = (group.counts[action] || 0) + 1;
    applications.set(application, group);
  }
  return { byAction, decidedByAction, byApplication: [...applications.values()], total: rows.length, decided };
}
function reduceState(state, action) {
  if (!action || typeof action.type !== 'string') return state;
  if (action.type === 'RESET') return initialState();
  if (action.type === 'EVALUATE') {
    if (state.evaluated) return state;
    const accessDecisions = Object.fromEntries(decisions.map(row => {
      const model = recommendation(row);
      if (row.recommendedAction === 'NOT_PERMITTED') Object.assign(model, {
        decidedAction: 'NOT_PERMITTED', status: 'Policy-locked', decidedBy: SYSTEM_ACTOR, decidedAt: SCENARIO.receivedAt, decisionSource: 'policy-locked',
      });
      return [row.id, model];
    }));
    return { ...state, evaluated: true, accessDecisions, actionCount: state.actionCount + 1,
      decisionEvidence: decisions.map(row => decisionRecord(row, accessDecisions[row.id], 'recommendation')) };
  }
  if (action.type === 'ACCEPT_ALL') {
    if (!editable(state) || !['human', 'agent'].includes(action.scope)) return state;
    const rows = decisions.filter(row => (action.scope === 'human' ? row.scope === 'human' : row.scope !== 'human')
      && isUndecidedRecommendation(getAccessDecision(row, state)));
    return rows.length ? recordDecisions(state, rows.map(row => [row, decisionFor(row, row.recommendedAction)])) : state;
  }
  if (action.type === 'DECIDE') {
    if (!editable(state) || !ACTIONS.includes(action.action)) return state;
    const row = decisions.find(item => item.id === action.rowId);
    if (!row || row.recommendedAction === 'NOT_PERMITTED') return state;
    if (row.recommendedAction === 'REVIEW') return action.action === 'DO_NOT_GRANT' ? reviewDecision(state, 'rejected', action.comment) : state;
    const allowed = ['KEEP', 'REMOVE'].includes(row.recommendedAction) ? ['KEEP', 'REMOVE'] : ['GRANT', 'DO_NOT_GRANT'];
    if (!allowed.includes(action.action)) return state;
    if (row.id === 'h-ar' && action.action === 'KEEP' && sodDependency(state).required) return state;
    const comment = action.comment ?? '';
    if (!validComment(comment)) return state;
    const decisionSource = action.decisionSource ?? (action.action === row.recommendedAction && !comment.trim() ? 'accepted-recommendation' : 'manual-override');
    if (!['accepted-recommendation', 'manual-override', 'rejected-recommendation'].includes(decisionSource)
      || (decisionSource === 'accepted-recommendation' && action.action !== row.recommendedAction)
      || (decisionSource === 'rejected-recommendation' && action.action === row.recommendedAction)) return state;
    if (!validComment(comment, decisionSource !== 'accepted-recommendation')) return state;
    const model = decisionFor(row, action.action, comment.trim(), decisionSource);
    if (row.id === 'h-ar' && state.review !== 'pending') model.sod = sodEvidence(sodDependency(state).required);
    const previous = getAccessDecision(row, state);
    if (previous.decidedAction === model.decidedAction && previous.comment === model.comment && previous.decisionSource === model.decisionSource) return state;
    return recordDecisions(state, [[row, model]]);
  }
  if (action.type === 'REVIEW') return reviewDecision(state, action.result, action.note);
  if (action.type === 'RESOLVE_SOD') {
    if (!editable(state) || !['remove-ar', 'deny-payment'].includes(action.resolution)) return state;
    const ar = decisions.find(row => row.id === 'h-ar');
    const comment = action.comment ?? '';
    if (!validComment(comment, action.resolution === 'deny-payment')) return state;
    if (action.resolution === 'remove-ar') {
      const model = decisionFor(ar, 'REMOVE', comment.trim(), 'manual-override');
      if (state.review !== 'pending') model.sod = sodEvidence(sodDependency(state).required);
      const previous = getAccessDecision(ar, state);
      return previous.decidedAction === 'REMOVE' && previous.comment === model.comment && previous.decisionSource === model.decisionSource ? state : recordDecisions(state, [[ar, model]]);
    }
    const payment = PAYMENT_ROW;
    return recordDecisions(state, [[ar, { ...decisionFor(ar, 'KEEP', comment.trim(), 'manual-override'), sod: sodEvidence(false) }], [payment, { ...decisionFor(payment, 'DO_NOT_GRANT', comment.trim(), 'high-risk-review'), sod: sodEvidence(false) }]], {
      review: 'rejected', reviewNote: comment.trim(),
    });
  }
  if (action.type === 'APPLY_DECISIONS') {
    if (!canApplyDecisions(state)) return state;
    const obligations = decisions.filter(row => row.entitlement === 'legacy-write' && effectiveDecision(row, state) === 'REMOVE')
      .map(row => decisionRecord(row, { ...getAccessDecision(row, state), manualFulfillment: manualObligation() }, `${state.actionCount + 1}-scheduled`));
    return { ...state, applied: true, decisionEvidence: [...state.decisionEvidence, ...obligations], actionCount: state.actionCount + 1 };
  }
  if (action.type === 'RUN_FULFILLMENT') {
    if (!state.applied || state.fulfillmentStarted || !canApplyDecisions({ ...state, applied: false })) return state;
    const tasks = {};
    const evidence = [];
    const ordered = [...decisions].sort((a, b) => Number(getAccessDecision(b, state).decidedAction === 'REMOVE') - Number(getAccessDecision(a, state).decidedAction === 'REMOVE'));
    ordered.forEach((row, index) => {
      const action = getAccessDecision(row, state).decidedAction;
      const at = new Date(Date.parse(SCENARIO.fulfillmentAt) + index * 1000).toISOString();
      let status; let detail;
      if (action === 'KEEP') {
        status = 'Retained'; detail = { method: 'Existing access verified', owner: 'Identity Operations', sla: 'No change required', reference: `VERIFY-${row.id}` };
      } else if (action === 'NOT_PERMITTED') {
        status = 'Not permitted by policy'; detail = { method: 'Policy enforcement', owner: 'AI Governance', sla: 'Effective immediately', reference: 'CONTROL-AI-303-0842' };
      } else if (action === 'DO_NOT_GRANT') {
        status = 'Not granted'; detail = { method: 'Grant withheld by access decision', owner: 'Identity Operations', sla: 'Not applicable', reference: `DECISION-0842-${row.id.toUpperCase()}` };
      } else if (row.entitlement === 'legacy-write' && action === 'REMOVE') {
        status = 'Task open'; detail = { method: LEGACY_TASK.method, owner: 'Martin Keller · Finance Platforms', sla: SCENARIO.legacyDue, reference: LEGACY_TASK.id };
      } else {
        // A conflicting operational permission must be removed before payment approval is activated.
        if (row.id === 'h-payment' && action === 'GRANT' && !paymentActivationAllowed(tasks)) return;
        status = action === 'REMOVE' ? 'Removed' : 'Granted';
        detail = { method: row.scope === 'outbound' ? 'Agent permission API' : 'Application connector API', owner: 'Identity Operations', sla: SCENARIO.scheduledRun.replace(/^Monday, /, ''), reference: `API-0842-${row.id.toUpperCase()}` };
        if (row.id === 'h-payment' && action === 'GRANT') detail.dependency = {
          policyId: 'POL-SOD-017', rowId: AR_ROW.id, status: tasks[AR_ROW.id].status,
          completionReference: evidence.find(record => record.rowId === AR_ROW.id && record.status === 'Removed').reference,
        };
      }
      tasks[row.id] = { status };
      evidence.push(executionRecord(row, status, at, detail));
    });
    const manualRows = decisions.filter(row => tasks[row.id]?.status === 'Task open');
    const legacyTask = manualRows.length ? { id: LEGACY_TASK.id, status: 'Task open', owner: LEGACY_TASK.owner, due: SCENARIO.legacyDue, rowIds: manualRows.map(row => row.id) } : null;
    const initiation = manualRows.length ? [manualTaskRecord(manualRows, 'initiated', SCENARIO.fulfillmentAt, {
      action: 'Manual fulfillment initiated', result: 'Open', reference: LEGACY_TASK.id,
    })] : [];
    return recordLifecycleCompletion({ ...state, fulfillmentStarted: true, tasks, legacyTask, fulfillmentEvidence: evidence,
      manualFulfillmentEvidence: [...state.manualFulfillmentEvidence, ...initiation], actionCount: state.actionCount + 1 }, evidence.at(-1).timestamp);
  }
  if (action.type === 'COMPLETE_LEGACY') {
    const rows = legacyTaskRows(state);
    if (!state.fulfillmentStarted || !rows.length || typeof action.reference !== 'string' || typeof action.note !== 'string'
      || !action.reference.trim() || !action.note.trim() || action.reference.length > 160 || action.note.length > 1500) return state;
    const tasks = { ...state.tasks };
    const records = rows.map(row => {
      tasks[row.id] = { status: 'Removed' };
      return executionRecord(row, 'Removed', SCENARIO.legacyCompletedAt, {
        method: 'DBA access revocation and verification', owner: 'Martin Keller · Finance Platforms',
        sla: SCENARIO.legacyDue, reference: action.reference.trim(), note: action.note.trim(), task: 'SN-TASK-004812',
      });
    });
    const legacyTask = { ...state.legacyTask, status: 'Completed', completedAt: records.at(-1).timestamp, reference: action.reference.trim(), note: action.note.trim() };
    const references = legacyTask.reference.split(/\s*\/\s*/);
    const completionRecord = manualTaskRecord(rows, 'completed', legacyTask.completedAt, {
      action: 'Completed manual access removal', completedBy: LEGACY_TASK.owner, verifiedBy: REVIEWER.name,
      summary: `Completed by ${LEGACY_TASK.owner}, verified by ${REVIEWER.name}`,
      result: 'Completed within SLA', changeReference: references.find(value => /^CHG-/.test(value)) || null,
      verificationReference: references.find(value => /^DBA-VERIFY-/.test(value)) || null,
      reference: legacyTask.reference, note: legacyTask.note,
    });
    return recordLifecycleCompletion({ ...state, tasks, legacyTask, actionCount: state.actionCount + 1,
      fulfillmentEvidence: [...state.fulfillmentEvidence, ...records],
      manualFulfillmentEvidence: [...state.manualFulfillmentEvidence, completionRecord],
    }, records.at(-1).timestamp);
  }
  return state;
}

export function demoReducer(state, action) {
  const next = reduceState(state, action);
  if (action?.type === 'RESET') return next;
  if (next === state) return state;
  const savedAction = { type: action.type };
  if (action.type === 'ACCEPT_ALL') savedAction.scope = action.scope;
  if (action.type === 'DECIDE') Object.assign(savedAction, { rowId: action.rowId, action: action.action, comment: (action.comment ?? '').trim() });
  if (action.type === 'DECIDE' && action.decisionSource !== undefined) savedAction.decisionSource = action.decisionSource;
  if (action.type === 'REVIEW') Object.assign(savedAction, { result: action.result, note: action.note.trim() });
  if (action.type === 'RESOLVE_SOD') Object.assign(savedAction, { resolution: action.resolution, comment: (action.comment ?? '').trim() });
  if (action.type === 'COMPLETE_LEGACY') Object.assign(savedAction, { reference: action.reference.trim(), note: action.note.trim() });
  return { ...next, actions: [...state.actions, savedAction] };
}

export function effectiveDecision(row, state) {
  return getAccessDecision(row, state).decidedAction || row.recommendedAction;
}
export function fulfillmentStatus(row, state) {
  if (state.tasks[row.id]) return state.tasks[row.id].status;
  if (!state.evaluated) return 'Not reviewed';
  const action = getAccessDecision(row, state).decidedAction;
  if (!action) return 'Awaiting decision';
  if (!state.applied) return 'Not applied';
  if (action === 'KEEP') return 'No change required';
  if (action === 'NOT_PERMITTED') return 'Not permitted by policy';
  if (action === 'DO_NOT_GRANT') return 'Not granted';
  return 'Scheduled';
}
export function legacyTaskRows(state) {
  return decisions.filter(row => row.entitlement === 'legacy-write' && state.tasks[row.id]?.status === 'Task open');
}
export function connectedProvisioningRows(state, includeUnchanged = false) {
  return decisions.filter(row => {
    if (row.entitlement === 'legacy-write') return false;
    const action = getAccessDecision(row, state).decidedAction;
    // Agent usage changes are actionable; unchanged usage has no connected-app entitlement to provision.
    return ['GRANT', 'REMOVE'].includes(action) || (includeUnchanged && row.entitlement && action === 'KEEP');
  });
}
export function connectedChangeSummary(state) {
  const rows = connectedProvisioningRows(state);
  return { total: rows.length, completed: rows.filter(row => ['Granted', 'Removed'].includes(state.tasks[row.id]?.status)).length };
}
export function readiness(state) {
  return state.fulfillmentStarted && decisions.filter(row => getAccessDecision(row, state).decidedAction === 'GRANT').every(row => state.tasks[row.id]?.status === 'Granted');
}
export function controlComplete(state) {
  return state.fulfillmentStarted && decisions.filter(row => getAccessDecision(row, state).decidedAction === 'REMOVE').every(row => state.tasks[row.id]?.status === 'Removed')
    && state.tasks['a-payment']?.status === 'Not permitted by policy';
}
export function humanAccess(state) {
  const current = identities[0].access;
  return decisions.filter(row => row.scope === 'human').filter(row => current.includes(row.entitlement)
    ? state.tasks[row.id]?.status !== 'Removed' : state.tasks[row.id]?.status === 'Granted');
}
export function agentAccess(state) {
  const current = ['powerbi-fin', 'finance-reports', 'ar-operator', 'legacy-write'];
  return decisions.filter(row => row.scope === 'outbound').filter(row => current.includes(row.entitlement)
    ? state.tasks[row.id]?.status !== 'Removed' : state.tasks[row.id]?.status === 'Granted');
}
export function restoreState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const saved = JSON.parse(raw);
    if (![2, 3, STATE_VERSION].includes(saved.version) || !Array.isArray(saved.actions) || saved.actions.length > 1000) return initialState();
    const allowed = ['EVALUATE', 'ACCEPT_ALL', 'DECIDE', 'REVIEW', 'RESOLVE_SOD', 'APPLY_DECISIONS', 'RUN_FULFILLMENT', 'COMPLETE_LEGACY'];
    let replay = initialState();
    for (const action of saved.actions) {
      if (!action || !allowed.includes(action.type)) return initialState();
      // A previously applied 14-record event receives the two new standard
      // ServiceNow recommendations during migration, without losing its trail.
      if (saved.version === 2 && action.type === 'APPLY_DECISIONS') {
        for (const id of ['h-snow-self', 'h-snow-approver']) {
          const row = decisions.find(item => item.id === id);
          if (!getAccessDecision(row, replay).decidedAction) replay = demoReducer(replay, { type: 'DECIDE', rowId: id, action: row.recommendedAction });
        }
      }
      let next = demoReducer(replay, action);
      // Earlier sessions could approve payment, then accept only the remaining
      // receivables recommendation. It is already required in the new model;
      // replay that historical acceptance as the same explicit removal choice.
      if (next === replay && saved.version < STATE_VERSION && action.type === 'ACCEPT_ALL' && action.scope === 'human'
        && getAccessDecision(AR_ROW, replay).decisionSource === 'policy-required') {
        next = demoReducer(replay, { type: 'DECIDE', rowId: AR_ROW.id, action: 'REMOVE', comment: '', decisionSource: 'accepted-recommendation' });
      }
      if (next === replay) return initialState();
      replay = next;
    }
    return replay;
  } catch { return initialState(); }
}

export function lifecycleStatus(state) {
  return state.fulfillmentStarted ? controlComplete(state) ? 'Completed' : 'Manual task open'
    : state.applied ? 'Awaiting effective date' : canApplyDecisions(state) ? 'Ready to apply' : 'Needs decision';
}
export function sarahResumeTarget(state) {
  return state.fulfillmentStarted ? controlComplete(state) ? 'audit' : 'provisioning' : 'event';
}
