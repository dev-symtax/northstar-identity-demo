import { decisions, applicationById, entitlementById, identities } from '../data/catalog.js';
import { REVIEWER, SCENARIO } from '../data/scenario.js';

export const STORAGE_KEY = 'northstar-identity-demo-v1';
const STATE_VERSION = 3;
const ACTIONS = ['KEEP', 'GRANT', 'REMOVE', 'REVIEW', 'NOT_PERMITTED', 'DO_NOT_GRANT'];
const REVIEWER_LABEL = `${REVIEWER.name} · ${REVIEWER.role}`;
const SYSTEM_ACTOR = 'Northstar policy engine';
const EVENT_ID = 'WD-MOV-2026-0842';

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
function executionTimestamp(state) {
  // Editing access decisions does not advance the effective-date execution past its task SLA.
  return new Date(Date.parse(SCENARIO.fulfillmentAt) + Math.min(state.actionCount, 239) * 60000).toISOString();
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
  if (result === 'approved' && getAccessDecision(decisions.find(row => row.id === 'h-ar'), state).decidedAction === 'KEEP') return state;
  const row = decisions.find(item => item.id === 'h-payment');
  const model = decisionFor(row, result === 'approved' ? 'GRANT' : 'DO_NOT_GRANT', note.trim(), 'high-risk-review');
  const previous = getAccessDecision(row, state);
  if (state.review === result && previous.comment === model.comment) return state;
  return recordDecisions(state, [[row, model]], { review: result, reviewNote: model.comment });
}
export function canApplyDecisions(state) {
  if (!state.evaluated || state.applied || state.review === 'pending') return false;
  if (!decisions.every(row => getAccessDecision(row, state).decidedAction !== null)) return false;
  const action = id => getAccessDecision(decisions.find(row => row.id === id), state).decidedAction;
  return action('h-payment') !== 'GRANT' || action('h-ar') === 'REMOVE';
}
export function decisionSummary(state) {
  const byAction = Object.fromEntries(ACTIONS.map(action => [action, 0]));
  const applications = new Map();
  let decided = 0;
  for (const row of decisions) {
    const action = getAccessDecision(row, state).decidedAction;
    if (!action) continue;
    decided += 1;
    byAction[action] += 1;
    const application = row.entitlement ? applicationById[entitlementById[row.entitlement].app].name : 'Finance Operations Agent';
    const group = applications.get(application) || { application, name: application, count: 0, counts: {} };
    group.count += 1;
    group.counts[action] = (group.counts[action] || 0) + 1;
    applications.set(application, group);
  }
  return { byAction, byApplication: [...applications.values()], total: decisions.length, decided };
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
    if (row.id === 'h-ar' && action.action === 'KEEP' && state.review !== 'rejected') return state;
    const comment = action.comment ?? '';
    if (!validComment(comment)) return state;
    const decisionSource = action.decisionSource ?? (action.action === row.recommendedAction && !comment.trim() ? 'accepted-recommendation' : 'manual-override');
    if (!['accepted-recommendation', 'manual-override', 'rejected-recommendation'].includes(decisionSource)
      || (decisionSource === 'accepted-recommendation' && action.action !== row.recommendedAction)
      || (decisionSource === 'rejected-recommendation' && action.action === row.recommendedAction)) return state;
    if (!validComment(comment, decisionSource !== 'accepted-recommendation')) return state;
    const model = decisionFor(row, action.action, comment.trim(), decisionSource);
    const previous = getAccessDecision(row, state);
    if (previous.decidedAction === model.decidedAction && previous.comment === model.comment) return state;
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
      const previous = getAccessDecision(ar, state);
      return previous.decidedAction === 'REMOVE' && previous.comment === model.comment ? state : recordDecisions(state, [[ar, model]]);
    }
    const payment = decisions.find(row => row.id === 'h-payment');
    return recordDecisions(state, [[ar, decisionFor(ar, 'KEEP', comment.trim(), 'manual-override')], [payment, decisionFor(payment, 'DO_NOT_GRANT', comment.trim(), 'high-risk-review')]], {
      review: 'rejected', reviewNote: comment.trim(),
    });
  }
  if (action.type === 'APPLY_DECISIONS') {
    return canApplyDecisions(state) ? { ...state, applied: true, actionCount: state.actionCount + 1 } : state;
  }
  if (action.type === 'RUN_FULFILLMENT') {
    if (!state.applied || state.fulfillmentStarted) return state;
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
        status = 'Task open'; detail = { method: 'Manual access removal', owner: 'Martin Keller · Finance Platforms', sla: SCENARIO.legacyDue, reference: 'SN-TASK-004812' };
      } else {
        // A conflicting operational permission must be removed before payment approval is activated.
        if (row.id === 'h-payment' && action === 'GRANT' && tasks['h-ar']?.status !== 'Removed') return;
        status = action === 'REMOVE' ? 'Removed' : 'Granted';
        detail = { method: row.scope === 'outbound' ? 'Agent permission API' : 'Application connector API', owner: 'Identity Operations', sla: 'Effective date · 08:00 UTC', reference: `API-0842-${row.id.toUpperCase()}` };
      }
      tasks[row.id] = { status };
      evidence.push(executionRecord(row, status, at, detail));
    });
    const manualRows = decisions.filter(row => tasks[row.id]?.status === 'Task open');
    const legacyTask = manualRows.length ? { id: 'SN-TASK-004812', status: 'Task open', owner: 'Martin Keller', due: SCENARIO.legacyDue, rowIds: manualRows.map(row => row.id) } : null;
    return recordLifecycleCompletion({ ...state, fulfillmentStarted: true, tasks, legacyTask, fulfillmentEvidence: evidence, actionCount: state.actionCount + 1 }, evidence.at(-1).timestamp);
  }
  if (action.type === 'COMPLETE_LEGACY') {
    const rows = legacyTaskRows(state);
    if (!state.fulfillmentStarted || !rows.length || typeof action.reference !== 'string' || typeof action.note !== 'string'
      || !action.reference.trim() || !action.note.trim() || action.reference.length > 160 || action.note.length > 1500) return state;
    const tasks = { ...state.tasks };
    const records = rows.map(row => {
      tasks[row.id] = { status: 'Removed' };
      return executionRecord(row, 'Removed', executionTimestamp(state), {
        method: 'DBA access revocation and verification', owner: 'Martin Keller · Finance Platforms',
        sla: SCENARIO.legacyDue, reference: action.reference.trim(), note: action.note.trim(), task: 'SN-TASK-004812',
      });
    });
    const legacyTask = { ...state.legacyTask, status: 'Completed', completedAt: records.at(-1).timestamp, reference: action.reference.trim(), note: action.note.trim() };
    const completionRecord = {
      id: 'MF-SN-TASK-004812-completed', eventId: EVENT_ID, category: 'Controlled task',
      actor: 'Martin Keller', action: 'Completed manual access removal',
      applicationId: 'legacy', target: 'Legacy Finance DB', entitlement: 'legacy-write', resource: 'Legacy Finance DB Write',
      task: 'SN-TASK-004812', result: 'Completed', timestamp: legacyTask.completedAt,
      reference: legacyTask.reference, note: legacyTask.note, rowIds: rows.map(row => row.id),
    };
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
    if (![2, STATE_VERSION].includes(saved.version) || !Array.isArray(saved.actions) || saved.actions.length > 1000) return initialState();
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
      const next = demoReducer(replay, action);
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
