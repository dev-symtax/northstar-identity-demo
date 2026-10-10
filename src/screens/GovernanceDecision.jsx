import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Check, ChevronRight, FileKey2, LockKeyhole, ShieldAlert, Users } from 'lucide-react';
import { decisions, policies, resourceName, subjectName, entitlementById, applicationById } from '../data/catalog.js';
import { ApplicationIcon, ApplicationName } from '../components/ApplicationIcon.jsx';
import { REVIEWER, SCENARIO } from '../data/scenario.js';
import { actionLabel, canApplyDecisions, fulfillmentStatus, getAccessDecision } from '../demo/state.js';
import { Actor, AgentName, Avatar, Badge, Button, Drawer, Empty, Field, Notice, PageTitle, SectionTitle, formatTime } from '../components/UI.jsx';
import { useStepFocus } from '../components/useStepFocus.js';
import '../styles/recommendations.css';

const ACTIONS = ['KEEP', 'GRANT', 'REMOVE', 'REVIEW', 'NOT_PERMITTED'];
const POLICY_LOCK_MESSAGE = 'Payment approval is restricted to human identities. This cannot be overridden.';
const SOD_MESSAGE = 'SoD conflict · POL-SOD-017: Accounts Receivable Operator and SAP Payment Approval cannot be held together';

function decisionTone(action) {
  return action === 'NOT_PERMITTED' ? 'neutral' : action === 'REVIEW' ? 'amber' : ['REMOVE', 'DO_NOT_GRANT'].includes(action) ? 'red' : 'green';
}
function allowedActions(access) {
  return ['KEEP', 'REMOVE'].includes(access.recommendedAction) ? ['KEEP', 'REMOVE'] : ['GRANT', 'DO_NOT_GRANT'];
}
function oppositeAction(access) {
  return access.recommendedAction === 'KEEP' ? 'REMOVE' : access.recommendedAction === 'REMOVE' ? 'KEEP' : 'DO_NOT_GRANT';
}
function isDecided(access) {
  return Boolean(access.decidedAction) || access.status === 'Policy-locked';
}

function RowControls({ row, access, applied, onAccept, onEdit, onReview, onLocked }) {
  if (access.status === 'Policy-locked') return <button className="policy-lock-control" onClick={onLocked}><LockKeyhole size={18} /><span>Locked by policy · View policy</span></button>;
  if (access.recommendedAction === 'REVIEW') return <Button variant="secondary" disabled={applied} onClick={onReview}>{access.decidedAction ? 'Change' : 'Review'}</Button>;
  return <div className="recommendation-controls" aria-label={`Actions for ${resourceName(row)}`}><Button variant="quiet" disabled={applied || access.status === 'Accepted'} onClick={() => onAccept(row)}>Accept</Button><Button variant="secondary" disabled={applied} onClick={() => onEdit(row, false)}>Change</Button><Button variant="secondary" disabled={applied} onClick={() => onEdit(row, true)}>Reject</Button></div>;
}

function DecisionStatus({ access, hideRecommended = false }) {
  if (hideRecommended && access.status === 'Recommended') return null;
  return <div className="recommendation-status"><Badge tone={access.status === 'Needs review' ? 'amber' : access.status === 'Changed' ? 'blue' : access.status === 'Accepted' ? 'green' : 'neutral'}>{access.status}</Badge>{access.status === 'Changed' && <small>Changed from {actionLabel(access.recommendedAction)} to {actionLabel(access.decidedAction)}</small>}{access.status !== 'Changed' && access.decidedAction && <small>{actionLabel(access.decidedAction)}</small>}{access.comment && <small className="recommendation-comment">{access.comment}</small>}</div>;
}

export default function GovernanceDecision({ state, dispatch, navigate }) {
  const [tab, setTab] = useState('human');
  const [detail, setDetail] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [note, setNote] = useState('Finance Manager duties reviewed. Payment access requires separate authorization and removal of conflicting Accounts Receivable Operator access.');
  const [reviewError, setReviewError] = useState('');
  const [reviewRequest, setReviewRequest] = useState(null);
  const [edit, setEdit] = useState(null);
  const [editError, setEditError] = useState('');
  const [pendingSod, setPendingSod] = useState(false);
  const [lockedNotice, setLockedNotice] = useState(false);
  const [toast, setToast] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);
  const [decisionRecorded, setDecisionRecorded] = useState(0);
  const [highlightAgentPayment, setHighlightAgentPayment] = useState(false);
  const [highlightRequest, setHighlightRequest] = useState(0);
  const exceptionRef = useRef(null);
  const confirmationRef = useRef(null);
  const agentPaymentRef = useRef(null);
  useEffect(() => {
    if (!reviewRequest) return;
    const payment = getAccessDecision(decisions.find(row => row.id === 'h-payment'), state);
    const record = state.decisionEvidence.findLast(entry => entry.rowId === 'h-payment');
    const action = reviewRequest.result === 'approved' ? 'GRANT' : 'DO_NOT_GRANT';
    if (state.review === reviewRequest.result && payment.decidedAction === action && payment.comment === reviewRequest.note) {
      // Announce only the decision accepted by the shared reducer. Reconfirming
      // an unchanged decision closes the drawer without another success toast.
      if (record?.id !== reviewRequest.beforeRecordId) {
        setToast('Decision recorded for SAP Payment Approval.');
        setDecisionRecorded(value => value + 1);
      }
      setReviewOpen(false);
    } else {
      setReviewError('The decision could not be recorded. Review the access conditions and try again.');
    }
    setReviewRequest(null);
  }, [state, reviewRequest]);
  useStepFocus(exceptionRef, state.evaluated && tab === 'human', { block: 'nearest' });
  useEffect(() => {
    if (!decisionRecorded) return;
    const frame = requestAnimationFrame(() => confirmationRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [decisionRecorded]);
  useEffect(() => {
    if (!highlightRequest) return;
    const frame = requestAnimationFrame(() => agentPaymentRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const timer = setTimeout(() => setHighlightAgentPayment(false), 2500);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [highlightRequest]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const closeDetail = useCallback(() => setDetail(null), []);
  const closeReview = useCallback(() => setReviewOpen(false), []);
  const closeApply = useCallback(() => setApplyOpen(false), []);
  const scopeRows = decisions.filter(row => tab === 'human' ? row.scope === 'human' : row.scope !== 'human');
  const rows = scopeRows.filter(row => row.scope !== 'inbound').sort((a, b) => { const priority = row => { const access = getAccessDecision(row, state); return access.status === 'Needs review' ? 0 : access.status === 'Recommended' ? 1 : access.status === 'Policy-locked' ? 3 : 2; }; return priority(a) - priority(b); });
  const agentUsage = decisions.find(row => row.scope === 'inbound');
  const counts = Object.fromEntries(ACTIONS.map(action => {
    const matching = scopeRows.filter(row => getAccessDecision(row, state).recommendedAction === action);
    return [action, { total: matching.length, decided: matching.filter(row => isDecided(getAccessDecision(row, state))).length }];
  }));
  const decidedCount = scopeRows.filter(row => isDecided(getAccessDecision(row, state))).length;
  const applicationSummary = Object.values(decisions.reduce((summary, row) => {
    const name = row.entitlement ? applicationById[entitlementById[row.entitlement].app].name : 'Finance Operations Agent';
    summary[name] ||= { name, appId: row.entitlement ? entitlementById[row.entitlement].app : null, count: 0 };
    summary[name].count += 1;
    return summary;
  }, {}));
  const actionSummary = decisions.reduce((summary, row) => {
    const access = getAccessDecision(row, state);
    const action = access.decidedAction || access.recommendedAction;
    summary[action] = (summary[action] || 0) + 1;
    return summary;
  }, {});
  const arDecision = getAccessDecision(decisions.find(row => row.id === 'h-ar'), state);
  const paymentDecision = getAccessDecision(decisions.find(row => row.id === 'h-payment'), state);
  const applyEnabled = canApplyDecisions(state) && !edit && !pendingSod;

  function switchTab(nextTab) {
    setTab(nextTab); setEdit(null); setEditError(''); setPendingSod(false); setLockedNotice(false);
  }
  function accept(row) {
    const access = getAccessDecision(row, state);
    dispatch({ type: 'DECIDE', rowId: row.id, action: access.recommendedAction, comment: '' });
    setToast(`Decision recorded for ${resourceName(row)}.`);
  }
  function acceptAll() {
    const count = scopeRows.filter(row => {
      const access = getAccessDecision(row, state);
      return !isDecided(access) && !['REVIEW', 'NOT_PERMITTED'].includes(access.recommendedAction);
    }).length;
    dispatch({ type: 'ACCEPT_ALL', scope: tab });
    setToast(`${count} recommendation${count === 1 ? '' : 's'} accepted.`);
  }
  function openEdit(row, deny) {
    const access = getAccessDecision(row, state);
    setEdit({ row, action: deny ? oppositeAction(access) : access.decidedAction || access.recommendedAction, comment: '' });
    setEditError(''); setPendingSod(false);
  }
  function saveEdit(event) {
    event.preventDefault();
    if (!edit.comment.trim()) { setEditError('Enter a comment for this decision.'); return; }
    if (edit.row.id === 'h-ar' && edit.action === 'KEEP' && state.review !== 'rejected') { setPendingSod(true); setEditError(''); return; }
    dispatch({ type: 'DECIDE', rowId: edit.row.id, action: edit.action, comment: edit.comment.trim() });
    setToast(`Decision recorded for ${resourceName(edit.row)}.`);
    setEdit(null); setEditError('');
  }
  function resolveSod(resolution) {
    if (!edit?.comment.trim()) { setEditError('Enter a comment for this decision.'); return; }
    dispatch({ type: 'RESOLVE_SOD', resolution, comment: edit.comment.trim() });
    setEdit(null); setPendingSod(false); setEditError('');
    setToast('SoD conflict resolved. Decisions recorded.');
    if (resolution === 'deny-payment') setDecisionRecorded(value => value + 1);
  }
  function openReview() {
    if (state.applied) return;
    setNote(state.reviewNote || 'Finance Manager duties reviewed. Payment access requires separate authorization and removal of conflicting Accounts Receivable Operator access.');
    setReviewError(''); setToast(''); setReviewOpen(true);
  }
  function review(result) {
    if (!note.trim()) { setReviewError('Enter a comment before recording the decision.'); return; }
    if (note.length > 3000) { setReviewError('The comment must be 3,000 characters or fewer.'); return; }
    if (result === 'approved' && arDecision.decidedAction === 'KEEP') { setReviewError(SOD_MESSAGE); return; }
    setReviewRequest({ result, note: note.trim(), beforeRecordId: state.decisionEvidence.findLast(entry => entry.rowId === 'h-payment')?.id });
    dispatch({ type: 'REVIEW', result, note: note.trim() });
  }
  function viewAgentPermissions() {
    switchTab('agent'); setHighlightAgentPayment(true); setHighlightRequest(value => value + 1);
  }
  function apply() {
    dispatch({ type: 'APPLY_DECISIONS' }); setApplyOpen(false); navigate(3);
  }
  function controls(row) {
    return <RowControls row={row} access={getAccessDecision(row, state)} applied={state.applied} onAccept={accept} onEdit={openEdit} onReview={openReview} onLocked={() => setLockedNotice(true)} />;
  }
  function editForm(row) {
    if (edit?.row.id !== row.id) return null;
    return <form className="recommendation-edit" data-change-for={row.id} aria-label={`Change ${resourceName(row)}`} onSubmit={saveEdit}>
      <div className="recommendation-edit-fields"><div><label className="form-label" htmlFor={`action-${row.id}`}>Decision</label><select id={`action-${row.id}`} value={edit.action} onChange={event => { setEdit({ ...edit, action: event.target.value }); setPendingSod(false); setEditError(''); }}>{allowedActions(getAccessDecision(row, state)).map(action => <option key={action} value={action}>{actionLabel(action)}</option>)}</select></div><div><label className="form-label" htmlFor={`comment-${row.id}`}>Comment</label><input id={`comment-${row.id}`} value={edit.comment} onChange={event => { setEdit({ ...edit, comment: event.target.value }); setEditError(''); }} maxLength={3000} autoFocus required /></div></div>
      {editError && <p className="error-text" role="alert">{editError}</p>}
      {pendingSod && <div className="recommendation-sod" role="alert"><Notice tone="amber" icon={ShieldAlert}><strong>{SOD_MESSAGE}</strong><p>The Keep decision has not been recorded.</p><div className="recommendation-resolution"><Button type="button" variant="secondary" onClick={() => resolveSod('remove-ar')}>Remove Accounts Receivable Operator</Button><Button type="button" variant="danger" onClick={() => resolveSod('deny-payment')}>Deny Payment Approval</Button></div></Notice></div>}
      <div className="recommendation-edit-actions"><Button type="button" variant="secondary" onClick={() => { setEdit(null); setPendingSod(false); }}>Cancel</Button><Button type="submit">Save change</Button></div>
    </form>;
  }

  if (!state.evaluated) return <><PageTitle eyebrow="WD-MOV-2026-0842" title="Access recommendations" description="Review the lifecycle event to generate recommendations for Sarah Miller." /><Empty title="Recommendations not available" action="View lifecycle event" onAction={() => navigate(1)}>The lifecycle event has not been evaluated.</Empty></>;

  return <div className="recommendations-screen">
    <PageTitle eyebrow="WD-MOV-2026-0842" title="Access recommendations" description="Review and decide Sarah Miller’s access for the Finance Manager role." action={<Avatar name="Sarah Miller" large />} />
    <div className="recommendation-sticky-summary"><div><strong>Decided {decisions.filter(row => isDecided(getAccessDecision(row, state))).length} of {decisions.length}</strong><span>{state.applied ? 'Decisions applied' : 'All recommendations require a decision before applying.'}</span></div><Button variant="secondary" disabled={!applyEnabled} icon={ArrowRight} onClick={() => setApplyOpen(true)}>Apply decisions</Button></div>
    {tab === 'human' && <section ref={exceptionRef} className={`exception-panel ${state.review !== 'pending' ? 'resolved' : ''}`}><div className="exception-icon"><ShieldAlert size={24} strokeWidth={1.5} /></div><div className="exception-content"><span className="eyebrow">{paymentDecision.decidedAction ? 'POLICY REVIEW · DECISION RECORDED' : 'POLICY VIOLATION · SOD CONFLICT REQUIRES REVIEW'}</span><h2>SAP Payment Approval</h2><p>{state.review === 'pending' ? 'SAP Payment Approval requires a decision. Accounts Receivable Operator must be removed before payment approval can be activated.' : state.review === 'approved' ? 'Approved · activates after Accounts Receivable Operator is removed' : 'Denied · SAP Payment Approval will not be granted.'}</p><div className="exception-policies"><span>POL-RISK-204</span><span>POL-SOD-017</span><span>Reviewer: {REVIEWER.name} · {REVIEWER.role}</span></div></div>{paymentDecision.decidedAction ? <Badge tone={paymentDecision.decidedAction === 'GRANT' ? 'green' : 'red'}>{paymentDecision.decidedAction === 'GRANT' ? 'Approved' : 'Denied'}</Badge> : <div className="recommendation-review-actions"><Button variant="danger" disabled={state.applied} onClick={openReview}>Deny</Button><Button variant="quiet" disabled={state.applied} icon={Check} onClick={openReview}>Approve</Button></div>}</section>}
    <div className="decision-summary">{ACTIONS.map(action => <div key={action} className={counts[action].total === 0 ? 'zero-count' : ''}><Badge tone={counts[action].total === 0 ? 'neutral' : decisionTone(action)} dot={false}>{action === 'NOT_PERMITTED' ? 'Not permitted' : actionLabel(action)}</Badge><strong>{counts[action].total}</strong><span>Decided {counts[action].decided} of {counts[action].total}</span></div>)}</div>
    {state.review !== 'pending' && <div ref={confirmationRef} role="status" className="recommendation-confirmation"><Notice><strong>Decision recorded for SAP Payment Approval</strong><div className="recommendation-confirmation-agent"><span>Agent: Not permitted by policy</span><button className="text-link" onClick={viewAgentPermissions}>View agent permissions<ChevronRight size={14} /></button></div></Notice></div>}
    {state.applied && <Notice><strong>Decisions applied.</strong> Changes are scheduled for {SCENARIO.effectiveDate}.<button className="text-link" onClick={() => navigate(3)}>View provisioning<ChevronRight size={14} /></button></Notice>}
    <div className="decision-tabs tabs" role="tablist" aria-label="Access identity"><button role="tab" aria-label="Human access" aria-selected={tab === 'human'} className={tab === 'human' ? 'active' : ''} onClick={() => switchTab('human')}><Users size={17} />Human access<span>{decisions.filter(row => row.scope === 'human').length}</span></button><button role="tab" aria-label="AI agent" aria-selected={tab === 'agent'} className={tab === 'agent' ? 'active' : ''} onClick={() => switchTab('agent')}><Bot size={17} />AI agent<span>{decisions.filter(row => row.scope !== 'human').length}</span></button></div>
    <div className="recommendation-toolbar"><span>Decided {decidedCount} of {scopeRows.length}</span><Button disabled={state.applied} onClick={acceptAll}>Accept all recommendations</Button></div>
    {toast && <div role="status" className="recommendation-toast">{toast}</div>}
    {tab === 'agent' && <section className="panel inbound-panel recommendation-usage" data-row-id={agentUsage.id}><div><span className="eyebrow">AI AGENT · OWNER: SARAH MILLER</span><h2>Agent usage</h2><div className="relationship-path"><Avatar name="Sarah Miller" /><strong>Sarah Miller</strong><ArrowRight size={18} /><Bot size={22} /><strong>Finance Operations Agent</strong></div><p>Who may use the agent · POL-AI-301</p></div><div className="recommendation-usage-actions"><Badge tone="green">{actionLabel(getAccessDecision(agentUsage, state).recommendedAction)}</Badge><DecisionStatus access={getAccessDecision(agentUsage, state)} hideRecommended />{controls(agentUsage)}</div>{edit?.row.id === agentUsage.id && <div className="recommendation-usage-edit">{editForm(agentUsage)}</div>}</section>}
    <section className="panel decisions-panel"><SectionTitle title={tab === 'human' ? 'Human access' : 'Agent permissions'} description={tab === 'human' ? 'Sarah Miller · Finance Manager' : 'What the agent may access · AI agent · Owner: Sarah Miller'}><Badge tone="blue">Recommendations generated</Badge></SectionTitle><table><thead><tr><th>Entitlement / resource</th><th>Recommended</th><th>Status</th><th>Reason / policy</th><th>Decision</th><th></th></tr></thead><tbody>{rows.map(row => {
      const access = getAccessDecision(row, state);
      return <React.Fragment key={row.id}><tr data-row-id={row.id} ref={row.id === 'a-payment' ? agentPaymentRef : null} className={[access.recommendedAction === 'REVIEW' ? 'review-row' : access.status === 'Policy-locked' ? 'block-row' : '', row.id === 'a-payment' && highlightAgentPayment ? 'agent-block-highlight' : '', ['Accepted', 'Changed'].includes(access.status) ? 'settled-row' : ''].filter(Boolean).join(' ')}><td><div className="resource-cell"><ApplicationIcon appId={entitlementById[row.entitlement].app} /><div><button className="table-link" onClick={() => setDetail(row)}>{resourceName(row)}</button><small>{applicationById[entitlementById[row.entitlement].app].name}<span className="connection-indicator">{applicationById[entitlementById[row.entitlement].app].mode === 'API' ? 'Connected' : 'Manual'}</span></small></div></div></td><td><Badge tone={decisionTone(access.recommendedAction)}>{access.recommendedAction === 'NOT_PERMITTED' ? 'Not permitted by policy' : actionLabel(access.recommendedAction)}</Badge></td><td><DecisionStatus access={access} />{row.id === 'h-payment' && state.review === 'approved' && <small className="recommendation-condition">Approved · activates after Accounts Receivable Operator is removed</small>}</td><td className="reason-cell">{access.reason}<br /><span className="policy-id">{access.policyId}</span></td><td>{controls(row)}</td><td><button className="icon-button" aria-label={`Inspect ${resourceName(row)} ${row.scope === 'human' ? 'human access' : 'agent permissions'}`} onClick={() => setDetail(row)}><ChevronRight size={16} /></button></td></tr>{edit?.row.id === row.id && <tr className="recommendation-edit-row"><td colSpan={6}>{editForm(row)}</td></tr>}{row.id === 'a-payment' && lockedNotice && <tr className="recommendation-lock-row"><td colSpan={6}><section className="locked-policy-panel" role="region" aria-label="Locked payment policy"><h3>POL-AI-303</h3><p>{POLICY_LOCK_MESSAGE}</p></section></td></tr>}</React.Fragment>;
    })}</tbody></table></section>

    {tab === 'agent' && <Notice icon={LockKeyhole}>Payment approval is restricted to human identities (POL-AI-303).</Notice>}

    {detail && (() => { const access = getAccessDecision(detail, state); return <Drawer title={resourceName(detail)} subtitle={detail.scope === 'human' ? 'HUMAN ACCESS' : detail.scope === 'inbound' ? 'AGENT USAGE' : 'AGENT PERMISSIONS'} onClose={closeDetail}><dl><Field label="Identity">{detail.scope === 'outbound' ? <AgentName>{subjectName(detail)}</AgentName> : subjectName(detail)}</Field><Field label="Access">{resourceName(detail)}</Field>{detail.entitlement && <Field label="Application"><ApplicationName appId={entitlementById[detail.entitlement].app} /></Field>}<Field label="Business context">Finance Analyst → Finance Manager</Field><Field label="Recommended"><Badge tone={decisionTone(access.recommendedAction)}>{access.recommendedAction === 'NOT_PERMITTED' ? 'Not permitted by policy' : actionLabel(access.recommendedAction)}</Badge></Field><Field label="Status"><DecisionStatus access={access} /></Field><Field label="Reason">{access.reason}</Field><Field label="Policy">{access.policyId} · {policies.find(policy => policy.id === access.policyId)?.name}</Field>{detail.id === 'h-payment' && <Field label="Additional control">POL-SOD-017 · Receivables / payment separation</Field>}<Field label="Decided by"><Actor name={access.decidedBy || 'Not decided'} /></Field><Field label="Timestamp">{access.decidedAt ? formatTime(access.decidedAt) : 'Not decided'}</Field><Field label="Comment">{access.comment || '—'}</Field></dl><div className="detail-status"><span>Provisioning status</span><Badge>{fulfillmentStatus(detail, state)}</Badge></div><Button variant="secondary" icon={ArrowRight} onClick={() => { closeDetail(); navigate(4); }}>Open audit trail</Button></Drawer>; })()}
    {reviewOpen && <Drawer title="Review SAP Payment Approval" subtitle="POLICY VIOLATION · POL-SOD-017" onClose={closeReview}><Notice tone="amber" icon={ShieldAlert}>Accounts Receivable Operator conflicts with SAP Payment Approval. Payment approval activates after the conflicting access is removed.</Notice><dl><Field label="Identity">Sarah Miller · Finance Manager</Field><Field label="Reviewer"><Actor name={`${REVIEWER.name} · ${REVIEWER.role}`} /></Field><Field label="Risk">High · Payment authorization</Field><Field label="Policies">POL-RISK-204 + POL-SOD-017</Field></dl><label className="form-label" htmlFor="review-note">Comment</label><textarea id="review-note" value={note} onChange={event => { setNote(event.target.value); setReviewError(''); }} rows={5} maxLength={3000} required /><p className="form-hint">The comment is recorded in the audit trail.</p>{reviewError && <p role="alert" className="error-text">{reviewError}</p>}<div className="dialog-actions"><Button variant="danger" onClick={() => review('rejected')}>Deny</Button><Button icon={Check} onClick={() => review('approved')}>Approve</Button></div></Drawer>}
    {applyOpen && <Drawer title="Apply access decisions" subtitle="PROVISIONING CONFIRMATION" onClose={closeApply}><Notice>These decisions will be scheduled for {SCENARIO.effectiveDate}.</Notice><h3 className="recommendation-summary-title">By action</h3><table aria-label="Decisions by action"><thead><tr><th>Decided action</th><th>Records</th></tr></thead><tbody>{Object.entries(actionSummary).map(([action, count]) => <tr key={action}><td>{action === 'NOT_PERMITTED' ? 'Not permitted by policy' : actionLabel(action)}</td><td>{count}</td></tr>)}</tbody></table><h3 className="recommendation-summary-title">By application</h3><table aria-label="Decisions by application"><thead><tr><th>Application</th><th>Records</th></tr></thead><tbody>{applicationSummary.map(application => <tr key={application.name}><td>{application.appId ? <ApplicationName appId={application.appId} /> : application.name}</td><td>{application.count}</td></tr>)}</tbody></table><div className="dialog-actions"><Button variant="secondary" onClick={closeApply}>Cancel</Button><Button disabled={!applyEnabled} icon={ArrowRight} onClick={apply}>Apply decisions</Button></div></Drawer>}
  </div>;
}
