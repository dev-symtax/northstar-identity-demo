import React, { useCallback, useRef, useState } from 'react';
import { ArrowRight, ClipboardCheck, Download, Fingerprint, History, LockKeyhole } from 'lucide-react';
import { decisions, entitlementById, resourceName, subjectName } from '../data/catalog.js';
import WorkspacePage from './WorkspacePage.jsx';
import { ApplicationIcon, ApplicationName } from '../components/ApplicationIcon.jsx';
import { SCENARIO } from '../data/scenario.js';
import { actionLabel, getAccessDecision, legacyTaskRows } from '../demo/state.js';
import { Actor, Badge, Button, Drawer, Empty, Field, Notice, PageTitle, SectionTitle, formatTime } from '../components/UI.jsx';
import { useStepFocus } from '../components/useStepFocus.js';
import '../styles/provisioning-audit.css';

const byId = Object.fromEntries(decisions.map(row => [row.id, row]));
const keyIds = ['h-payment', 'a-inbound', 'a-payment', 'h-legacy', 'a-legacy'];
function latest(records) {
  const grouped = new Map();
  records.forEach(record => grouped.set(record.rowId, record));
  return [...grouped.values()];
}
function identityLabel(row) {
  return row.scope === 'human' ? 'Sarah Miller · User' : row.scope === 'inbound' ? 'Sarah Miller · Agent usage' : 'Finance Operations Agent · Agent permissions';
}
function decisionDetails(record, row, state) {
  const current = getAccessDecision(row, state);
  return {
    recommendedAction: record.recommendedAction ?? current.recommendedAction,
    decidedAction: Object.hasOwn(record, 'decidedAction') ? record.decidedAction : current.decidedAction,
    status: record.status ?? current.status,
    decidedBy: record.decidedBy ?? record.actor ?? current.decidedBy,
    decidedAt: record.decidedAt ?? record.timestamp ?? current.decidedAt,
    comment: record.comment ?? '',
    reason: record.reason ?? record.why ?? row.why,
    policyId: record.policyId ?? record.policy ?? row.policy,
  };
}
const completionReference = record => record.status === 'Task open' ? 'Pending completion' : record.status === 'Not granted' ? 'No grant executed' : record.reference || '—';

export default function Evidence({ state, navigate }) {
  const [tab, setTab] = useState('decision');
  const [history, setHistory] = useState(false);
  const [filter, setFilter] = useState('key');
  const [detail, setDetail] = useState(null);
  const tableRef = useRef(null);
  useStepFocus(tableRef, state.evaluated, { block: 'start' });
  const close = useCallback(() => setDetail(null), []);
  const decisionRows = history ? state.decisionEvidence : latest(state.decisionEvidence);
  const provisioningRows = history ? state.fulfillmentEvidence : latest(state.fulfillmentEvidence);
  const allRecords = tab === 'decision' ? decisionRows : provisioningRows;
  const records = allRecords.filter(record => filter === 'key' ? keyIds.includes(record.rowId) : filter === 'overrides' ? (tab === 'decision' ? record.status === 'Changed' : getAccessDecision(byId[record.rowId], state).status === 'Changed') : filter === 'locked' ? record.rowId === 'a-payment' : filter === 'manual' ? ['h-legacy', 'a-legacy'].includes(record.rowId) && getAccessDecision(byId[record.rowId], state).decidedAction === 'REMOVE' : true).sort((a, b) => filter === 'key' ? keyIds.indexOf(a.rowId) - keyIds.indexOf(b.rowId) : 0);
  const openManual = legacyTaskRows(state).length > 0;
  function exportAuditTrail() {
    const enrich = record => ({ ...record, identity: subjectName(byId[record.rowId]), access: resourceName(byId[record.rowId]), scope: byId[record.rowId].scope === 'human' ? 'User' : byId[record.rowId].scope === 'inbound' ? 'Agent usage' : 'Agent permissions', ...(record.rowId === 'h-payment' ? { additionalPolicy: 'POL-SOD-017' } : {}) });
    const accessDecisions = decisions.map(row => ({ rowId: row.id, identity: subjectName(row), access: resourceName(row), ...getAccessDecision(row, state) }));
    const bundle = { product: 'Northstar Identity', customer: 'Meridian Global', eventId: 'WD-MOV-2026-0842', source: 'Workday', receivedAt: SCENARIO.receivedAt, previousRole: 'Finance Analyst', targetRole: 'Finance Manager', effectiveDate: SCENARIO.effectiveDateISO, timezone: 'UTC', applied: state.applied, accessDecisions, decisionEvidence: state.decisionEvidence.map(enrich), provisioningEvidence: state.fulfillmentEvidence.map(enrich) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'northstar-sarah-miller-audit-trail.json'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!state.evaluated) return <WorkspacePage page="audit" state={state} navigate={navigate} />;
  const detailRow = detail && byId[detail.record.rowId];
  const detailDecision = detail?.type === 'decision' && decisionDetails(detail.record, detailRow, state);
  return <>
    <PageTitle eyebrow="AUDIT · WD-MOV-2026-0842" title="Audit trail" description={`Access decisions and provisioning records for Sarah Miller’s role change effective ${SCENARIO.effectiveDate}.`} action={<Button icon={Download} onClick={exportAuditTrail}>Export audit trail</Button>} />
    <div className="evidence-intro-grid">
      <section className={`evidence-definition ${tab === 'decision' ? 'selected' : ''}`}><span className="definition-icon"><Fingerprint size={24} strokeWidth={1.5} /></span><div><span className="eyebrow">ACCESS DECISIONS</span><h2>Recommendations and decisions</h2><p>Identity · Access · Action · Reviewer · Policy</p><small>Includes accepted recommendations, overrides and policy-locked access.</small></div></section>
      <section className={`evidence-definition ${tab === 'provisioning' ? 'selected' : ''}`}><span className="definition-icon"><ClipboardCheck size={24} strokeWidth={1.5} /></span><div><span className="eyebrow">PROVISIONING ACTIVITY</span><h2>Execution and completion</h2><p>Method · Status · Owner · SLA · Reference</p><small>Includes automated results and manual task completion.</small></div></section>
    </div>
    {(!state.fulfillmentStarted || openManual) && <Notice tone="amber"><strong>{openManual ? '1 manual task open.' : state.applied ? 'Provisioning has not started.' : 'Access decisions have not been applied.'}</strong> <button className="inline-link" onClick={() => navigate(state.applied ? 3 : 2)}>{state.applied ? 'Open provisioning' : 'Review access recommendations'}</button></Notice>}
    <div className="evidence-toolbar"><div className="tabs" role="tablist" aria-label="Audit record type">
      <button role="tab" aria-label="Decisions" aria-selected={tab === 'decision'} className={tab === 'decision' ? 'active' : ''} onClick={() => setTab('decision')}><Fingerprint size={16} />Decisions<span>{latest(state.decisionEvidence).length}</span></button>
      <button role="tab" aria-label="Provisioning" aria-selected={tab === 'provisioning'} className={tab === 'provisioning' ? 'active' : ''} onClick={() => setTab('provisioning')}><ClipboardCheck size={16} />Provisioning<span>{latest(state.fulfillmentEvidence).length}</span></button>
    </div><label className="history-toggle"><input type="checkbox" checked={history} onChange={event => setHistory(event.target.checked)} /><History size={15} />Show full history</label></div>
    <div className="filter-chips" aria-label="Audit filter">{[['key', 'Key controls'], ['overrides', 'Overrides'], ['locked', 'Policy-locked'], ['manual', 'Manual tasks'], ['all', 'All (14)']].map(([key, label]) => <button key={key} aria-pressed={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div>
    <section className="panel evidence-panel audit-panel" ref={tableRef}>
      <SectionTitle title={tab === 'decision' ? 'Decisions' : 'Provisioning'} description={history ? 'Recorded transitions for the lifecycle event.' : ({ all: 'Latest record for each access recommendation.', key: 'Payment approval, agent usage, policy restriction and both legacy access decisions.', overrides: 'Decisions changed from the recommended action.', locked: 'Permissions restricted by policy.', manual: 'Legacy access decisions linked to manual removal tasks.' })[filter]}>
        <span className="muted-label">{records.length} records</span>
      </SectionTitle>
      {records.length ? <table><thead><tr>{(tab === 'decision' ? ['Identity / access', 'Recommended', 'Decided', 'Decided by', 'Policy', 'Timestamp', 'Comment'] : ['Identity / access', 'How', 'Status', 'Owner', 'SLA / due', 'Completion reference']).map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{records.map(record => {
        const row = byId[record.rowId];
        const entry = tab === 'decision' ? decisionDetails(record, row, state) : null;
        const locked = entry?.status === 'Policy-locked' || row.id === 'a-payment';
        const changed = entry?.status === 'Changed';
        return <tr key={record.id} data-row-id={row.id}>
          <td><div className="audit-access">{row.entitlement && <ApplicationIcon appId={entitlementById[row.entitlement].app} />}<button className="table-link" onClick={() => setDetail({ type: tab, record })}>{resourceName(row)}</button></div><small className="cell-subtitle">{identityLabel(row)}</small></td>
          {entry ? <>
            <td><Badge>{actionLabel(entry.recommendedAction)}</Badge></td>
            <td>{locked ? <span className="audit-policy-lock"><LockKeyhole size={13} />Not permitted by policy · POL-AI-303</span> : <><Badge>{entry.decidedAction ? actionLabel(entry.decidedAction) : 'Not decided'}</Badge><small className="cell-subtitle">{changed ? `Changed from ${actionLabel(entry.recommendedAction)} to ${actionLabel(entry.decidedAction)}` : entry.status}</small></>}</td>
            <td><Actor name={entry.decidedAction || locked ? entry.decidedBy || 'Policy engine' : '—'} /></td><td className="policy-id">{entry.policyId}{row.id === 'h-payment' && <small className="cell-subtitle policy-id">POL-SOD-017</small>}</td><td className="timestamp-cell">{formatTime(entry.decidedAt || record.timestamp)}</td><td className="audit-comment-cell">{entry.comment || '—'}</td>
          </> : <><td>{record.method}</td><td><Badge>{record.status}</Badge></td><td>{record.owner}</td><td>{record.sla}</td><td className="reference-cell">{completionReference(record)}</td></>}
        </tr>;
      })}</tbody></table> : <div className="table-empty evidence-empty"><ClipboardCheck size={25} /><h3>{allRecords.length ? 'No records match this filter' : 'No provisioning records'}</h3><p>Provisioning activity is recorded after the applied decisions are executed.</p><Button variant="secondary" icon={ArrowRight} onClick={() => navigate(3)}>Open provisioning</Button></div>}
      <div className="table-footer"><span>Event WD-MOV-2026-0842 · Workday</span><span>UTC timestamps</span></div>
    </section>
    {detail && <Drawer title={resourceName(detailRow)} subtitle={detail.type === 'decision' ? 'ACCESS DECISION' : 'PROVISIONING RECORD'} onClose={close}>
      <dl><Field label="Event">WD-MOV-2026-0842 · Workday</Field><Field label="Identity">{identityLabel(detailRow)}</Field><Field label="Access">{resourceName(detailRow)}</Field>{detailRow.entitlement && <Field label="Application"><ApplicationName appId={entitlementById[detailRow.entitlement].app} /></Field>}
        {detailDecision ? <>
          <Field label="Recommended">{actionLabel(detailDecision.recommendedAction)}</Field><Field label="Decided">{detailDecision.status === 'Policy-locked' ? 'Not permitted by policy · POL-AI-303' : detailDecision.decidedAction ? actionLabel(detailDecision.decidedAction) : 'Not decided'}</Field><Field label="Status">{detailDecision.status}</Field>
          <Field label="Reason">{detailDecision.reason}</Field><Field label="Policy">{detailDecision.policyId}{detailRow.id === 'h-payment' && ' · POL-SOD-017'}</Field><Field label="Decided by"><Actor name={detailDecision.decidedAction ? detailDecision.decidedBy || 'Policy engine' : '—'} /></Field><Field label="Timestamp">{formatTime(detailDecision.decidedAt || detail.record.timestamp)}</Field><Field label="Comment">{detailDecision.comment || '—'}</Field>
        </> : <>
          <Field label="How">{detail.record.method}</Field><Field label="Status"><Badge>{detail.record.status}</Badge></Field><Field label="Owner">{detail.record.owner}</Field><Field label="SLA / due">{detail.record.sla}</Field>{detail.record.status === 'Task open' && <Field label="Task reference">{detail.record.reference}</Field>}<Field label="Completion reference">{completionReference(detail.record)}</Field><Field label="Timestamp">{formatTime(detail.record.timestamp)}</Field>{detail.record.task && <Field label="Linked task">{detail.record.task}</Field>}{detail.record.note && <Field label="Verification note">{detail.record.note}</Field>}
        </>}
      </dl><Notice>{detail.type === 'decision' ? detailDecision.status === 'Policy-locked' ? 'Payment approval is restricted to human identities (POL-AI-303). This cannot be overridden.' : 'The decision record is linked to the lifecycle event. Provisioning is recorded separately.' : detail.record.status === 'Task open' ? 'Completion is pending verification of the selected access removals.' : 'The provisioning record is linked to the applied access decision.'}</Notice>
      <Button variant="secondary" onClick={() => { setTab(detail.type === 'decision' ? 'provisioning' : 'decision'); close(); }}>View {detail.type === 'decision' ? 'provisioning' : 'decisions'}</Button>
    </Drawer>}
  </>;
}
