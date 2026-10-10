import React from 'react';
import { ApplicationName } from '../components/ApplicationIcon.jsx';
import { SCENARIO } from '../data/scenario.js';
import { ArrowRight, Bot, CalendarDays, GitBranch, ShieldCheck, Workflow } from 'lucide-react';
import { Avatar, Badge, Button, PageTitle, SectionTitle } from '../components/UI.jsx';

export default function RoleChangeEvent({ state, dispatch, navigate }) {
  const reviewAccess = () => {
    if (!state.evaluated) dispatch({ type: 'EVALUATE' });
    navigate(2);
  };
  return <>
    <PageTitle eyebrow="LIFECYCLE EVENTS" title="Lifecycle event" description="Mover: Finance Analyst → Finance Manager" action={<Button icon={ShieldCheck} onClick={reviewAccess}>Review access recommendations</Button>} />
    <section className="panel event-panel"><div className="event-header"><div className="event-source"><div><strong><ApplicationName appId="workday" /> mover event</strong><small>WD-MOV-2026-0842 · HR source of truth</small></div></div><Badge tone={state.evaluated ? 'green' : 'blue'}>{state.evaluated ? 'Recommendations ready' : 'Received'}</Badge></div><div className="event-body"><div className="event-person"><Avatar name="Sarah Miller" large /><div><h2>Sarah Miller</h2><span>MG-010482 · Finance · London, UK</span></div></div><div className="role-transition"><div><span className="eyebrow">PREVIOUS ROLE</span><h3>Finance Analyst</h3><p>Operational Finance access</p></div><span className="transition-arrow"><ArrowRight size={26} /></span><div className="target-role"><span className="eyebrow">NEW ROLE</span><h3>Finance Manager</h3><p>Management and budget accountability</p></div></div><div className="event-metadata"><div><CalendarDays size={17} /><span>Effective <strong>{SCENARIO.effectiveDate}</strong></span></div><div><GitBranch size={17} /><span>Source event received <strong>{SCENARIO.sourceReceivedLabel}</strong></span></div></div></div></section>
    <div className="event-context-grid"><section><SectionTitle title="Affected access" description="4 entitlements · 1 AI agent" /><div className="evaluation-list"><div><span className="evaluation-icon"><ShieldCheck size={21} /></span><div><h3>Current access</h3><p>SAP FI Viewer, Power BI Finance, Accounts Receivable Operator and Legacy Finance DB Write.</p></div><span className="evaluation-number">04</span></div><div><span className="evaluation-icon"><Workflow size={21} /></span><div><h3>Policy violation</h3><p>SoD conflict requires review for SAP Payment Approval.</p></div><span className="evaluation-number">01</span></div><div><span className="evaluation-icon"><Bot size={21} /></span><div><h3>Finance Operations Agent</h3><p>AI agent · Owner: Sarah Miller. Review agent usage and agent permissions.</p></div><span className="evaluation-number">01</span></div></div></section><aside className="business-context"><span className="eyebrow">APPLICABLE POLICIES</span><h2>Access policy scope</h2><ul className="event-policies"><li><strong>POL-FIN-101</strong><span>Finance role alignment</span></li><li><strong>POL-RISK-204 · POL-SOD-017</strong><span>Payment approval review and SoD conflict controls</span></li><li><strong>POL-AI-301 · POL-AI-302 · POL-AI-303</strong><span>Agent usage, application permissions and human-only payment approval</span></li></ul></aside></div>
  </>;
}
