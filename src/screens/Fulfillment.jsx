import React, { useCallback, useRef, useState } from 'react';
import { ArrowRight, Bot, Check, CheckCircle2, ChevronDown, Clock3, ClipboardCheck, FileCheck2, Play, Server, ShieldCheck, Zap } from 'lucide-react';
import { decisions, resourceName, entitlementById, applicationById } from '../data/catalog.js';
import { SCENARIO } from '../data/scenario.js';
import { actionLabel, fulfillmentStatus, getAccessDecision, legacyTaskRows } from '../demo/state.js';
import { Badge, Button, Drawer, Empty, Field, Notice, PageTitle, SectionTitle, Stat } from '../components/UI.jsx';
import { useStepFocus } from '../components/useStepFocus.js';
import '../styles/provisioning-audit.css';

const completedStatuses = new Set(['Retained', 'Granted', 'Removed', 'Not granted', 'Not permitted by policy']);
function identityLabel(row) {
  return row.scope === 'human' ? 'Sarah Miller' : row.scope === 'inbound' ? 'Sarah Miller · Agent usage' : 'Finance Operations Agent';
}

export default function Fulfillment({ state, dispatch, navigate }) {
  const [taskOpen, setTaskOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [connectedExpanded, setConnectedExpanded] = useState(false);
  const legacyRef = useRef(null);
  const openLegacy = legacyTaskRows(state);
  const legacyRows = decisions.filter(row => row.entitlement === 'legacy-write' && getAccessDecision(row, state).decidedAction === 'REMOVE');
  const legacyComplete = legacyRows.length > 0 && legacyRows.every(row => state.tasks[row.id]?.status === 'Removed');
  const hasManualTask = legacyRows.length > 0;
  const humanRemoval = legacyRows.some(row => row.scope === 'human');
  const agentRemoval = legacyRows.some(row => row.scope === 'outbound');
  const manualScope = humanRemoval && agentRemoval ? 'User and AI agent' : humanRemoval ? 'User only' : 'AI agent only';
  const revocationDescription = humanRemoval && agentRemoval ? 'Remove Sarah Miller’s database write privilege and the Finance Operations Agent’s write permission.' : humanRemoval ? 'Remove Sarah Miller’s database write privilege.' : 'Remove the Finance Operations Agent’s database write permission.';
  const completion = [...state.fulfillmentEvidence].reverse().find(record => legacyRows.some(row => row.id === record.rowId) && record.status === 'Removed');
  useStepFocus(legacyRef, state.fulfillmentStarted && hasManualTask);
  const closeTask = useCallback(() => setTaskOpen(false), []);
  const apiRows = decisions.filter(row => row.entitlement !== 'legacy-write');
  const completeApi = apiRows.filter(row => completedStatuses.has(state.tasks[row.id]?.status)).length;
  const connectedChanges = apiRows.filter(row => ['GRANT', 'REMOVE'].includes(getAccessDecision(row, state).decidedAction));
  const showConnected = !state.fulfillmentStarted || connectedExpanded;

  if (!state.applied) return <>
    <PageTitle eyebrow="ACCESS OPERATIONS · SARAH MILLER" title="Provisioning" description="Applied access decisions generate changes scheduled for the effective date." />
    <Empty title="No access decisions applied" action="Review access recommendations" onAction={() => navigate(2)}>Decide each access recommendation and resolve the policy violation before applying changes.</Empty>
  </>;

  function openTask() {
    setReference('CHG-2026-1042 / DBA-VERIFY-0842');
    setNote(humanRemoval && agentRemoval
      ? 'Martin Keller revoked Sarah Miller’s FIN_DB_WRITE membership and removed the Finance Operations Agent’s write mapping for Sarah Miller. User and agent write attempts were verified as denied.'
      : humanRemoval
        ? 'Martin Keller revoked Sarah Miller’s FIN_DB_WRITE membership. User write attempts were verified as denied.'
        : 'Martin Keller removed the Finance Operations Agent’s write mapping for Sarah Miller. Agent write attempts were verified as denied.');
    setError('');
    setTaskOpen(true);
  }
  function completeTask(event) {
    event.preventDefault();
    if (!reference.trim() || !note.trim()) { setError('A completion reference and verification note are required.'); return; }
    dispatch({ type: 'COMPLETE_LEGACY', reference, note });
    setTaskOpen(false);
  }
  function provision() {
    setConnectedExpanded(false);
    dispatch({ type: 'RUN_FULFILLMENT' });
  }

  return <>
    <PageTitle eyebrow="ACCESS OPERATIONS · SARAH MILLER" title="Provisioning" description={`Applied access decisions are scheduled for ${SCENARIO.effectiveDate}.`} action={state.fulfillmentStarted ? <Button variant="secondary" icon={ArrowRight} onClick={() => navigate(4)}>View audit trail</Button> : <Button icon={Play} onClick={provision}>Provision changes</Button>} />
    <div className={`fulfillment-banner ${state.fulfillmentStarted && !openLegacy.length ? 'complete' : ''}`}>
      <div className="banner-icon">{state.fulfillmentStarted && !openLegacy.length ? <CheckCircle2 size={26} /> : <Clock3 size={26} />}</div>
      <div><h2>{state.fulfillmentStarted ? `Role access provisioned. ${openLegacy.length ? '1 manual task open.' : 'No manual tasks open.'}` : `Changes scheduled for ${SCENARIO.effectiveDate}.`}</h2><p>{state.fulfillmentStarted ? 'Automated results and manual task status are recorded against the applied access decisions.' : 'No access has changed. Provisioning starts when the scheduled changes are run.'}</p></div>
      <Badge tone={state.fulfillmentStarted && !openLegacy.length ? 'green' : 'amber'}>{state.fulfillmentStarted ? openLegacy.length ? 'Task open' : 'Complete' : 'Scheduled'}</Badge>
    </div>
    <div className="stats-row three">
      <Stat label="Automated results" value={`${completeApi} / ${apiRows.length}`} detail={`${connectedChanges.length} connected access changes`} icon={Zap} />
      <Stat label="Manual tasks" value={!hasManualTask ? '0' : legacyComplete ? 'Complete' : state.fulfillmentStarted ? '1 open' : '1 scheduled'} detail={hasManualTask ? manualScope : 'No manual changes selected'} icon={ClipboardCheck} />
      <Stat label="Effective date" value="19 Oct 2026" detail="Monday · 08:00 UTC" icon={Clock3} />
    </div>
    <section className="panel provisioning-connected">
      <SectionTitle title="Connected applications · automated" description={state.fulfillmentStarted ? `${completeApi} results recorded · ${connectedChanges.length} access changes` : 'Scheduled actions from the applied decisions'}>
        {state.fulfillmentStarted && <button type="button" className="text-link" aria-expanded={showConnected} onClick={() => setConnectedExpanded(value => !value)}>{showConnected ? 'Hide results' : 'Show results'}<ChevronDown size={14} /></button>}
        <Badge tone="blue">{state.fulfillmentStarted ? 'Completed' : 'Scheduled'}</Badge>
      </SectionTitle>
      {showConnected && <table><thead><tr><th>Access</th><th>Identity</th><th>Application</th><th>Decided action</th><th>Status</th></tr></thead><tbody>{apiRows.map(row => <tr key={row.id} data-row-id={row.id}>
        <td><strong>{resourceName(row)}</strong></td><td><span className="scope-label">{row.scope !== 'human' && <Bot size={14} />}{identityLabel(row)}</span></td><td>{row.entitlement ? applicationById[entitlementById[row.entitlement].app].name : 'AI agent'}</td>
        <td><Badge>{actionLabel(getAccessDecision(row, state).decidedAction)}</Badge>{getAccessDecision(row, state).comment && <small className="cell-subtitle">{getAccessDecision(row, state).comment}</small>}</td><td><Badge>{fulfillmentStatus(row, state)}</Badge></td>
      </tr>)}</tbody></table>}
      <div className="access-bottom"><ShieldCheck size={16} /><span>{getAccessDecision(decisions.find(row => row.id === 'h-payment'), state).decidedAction === 'GRANT' ? 'POL-SOD-017 · Accounts Receivable Operator is removed before SAP Payment Approval is granted.' : 'POL-SOD-017 · Accounts Receivable Operator and SAP Payment Approval cannot be held together.'}</span></div>
    </section>
    <section className="panel legacy-panel" ref={legacyRef}>
      <SectionTitle title="Disconnected application · manual task" description="Legacy Finance DB"><Badge tone={!hasManualTask || legacyComplete ? 'green' : 'amber'}>{!hasManualTask ? 'Not required' : legacyComplete ? 'Complete' : state.fulfillmentStarted ? 'Task open' : 'Scheduled'}</Badge></SectionTitle>
      {hasManualTask ? <div className="legacy-task">
        <div className="legacy-task-title"><span className="legacy-icon"><Server size={24} strokeWidth={1.4} /></span><div><span className="eyebrow">SN-TASK-004812 · MANUAL TASK</span><h3>Remove Finance database write access</h3><p>{revocationDescription}</p></div></div>
        <div className="task-details">
          <div><span>OWNER</span><strong>Martin Keller</strong><small>Finance Platforms</small></div>
          <div><span>SLA / DUE</span><strong>{SCENARIO.legacyDue}</strong><small>4 hours from the effective-date run</small></div>
          <div><span>SCOPE</span><strong>{manualScope}</strong><small>{legacyRows.length} {legacyRows.length === 1 ? 'removal' : 'removals'} · 1 task</small></div>
          <div><span>COMPLETION REFERENCE</span><strong>{legacyComplete ? 'Completion confirmed' : 'Pending completion'}</strong><small>{completion?.reference || 'DBA verification required'}</small></div>
        </div>
        <div className="task-action"><p>{legacyComplete ? 'The completion reference and verification note are recorded for the selected removals.' : 'The task remains open until the selected access removals are verified.'}</p><Button variant="secondary" icon={FileCheck2} disabled={!state.fulfillmentStarted || !openLegacy.length} onClick={openTask}>{legacyComplete ? 'Completion confirmed' : 'Confirm completion'}</Button></div>
      </div> : <div className="manual-not-required"><p>Legacy Finance DB Write was retained for the user and AI agent. No manual removal task is required.</p></div>}
    </section>
    <Notice>Payment approval is restricted to human identities (POL-AI-303).</Notice>
    {taskOpen && <Drawer title="Confirm completion" subtitle="MANUAL TASK · SN-TASK-004812" onClose={closeTask}>
      <Notice>Confirm the selected database write removals and record verification.</Notice>
      <dl><Field label="Task">SN-TASK-004812</Field><Field label="Owner">Martin Keller · Finance Platforms</Field><Field label="Due">{SCENARIO.legacyDue}</Field><Field label="Scope">{manualScope}</Field><Field label="Required verification">{revocationDescription}</Field></dl>
      <form onSubmit={completeTask}><label className="form-label" htmlFor="completion-reference">Completion reference</label><input id="completion-reference" value={reference} onChange={event => { setReference(event.target.value); setError(''); }} maxLength={160} required />
        <label className="form-label" htmlFor="verification-note">Verification note</label><textarea id="verification-note" value={note} onChange={event => { setNote(event.target.value); setError(''); }} rows={5} maxLength={1500} required />
        {error && <p className="error-text" role="alert">{error}</p>}<div className="dialog-actions"><Button variant="secondary" type="button" onClick={closeTask}>Cancel</Button><Button icon={Check} type="submit">Confirm completion</Button></div>
      </form>
    </Drawer>}
  </>;
}
