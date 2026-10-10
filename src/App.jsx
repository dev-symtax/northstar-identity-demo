import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { ArrowRight, Building2, Check, ChevronDown, ChevronRight, ClipboardCheck, Fingerprint, GitBranch, ListChecks, LockKeyhole, Menu, ShieldCheck, Users } from 'lucide-react';
import { demoReducer, restoreState, STORAGE_KEY, controlComplete } from './demo/state.js';
import { REVIEWER, SCENARIO } from './data/scenario.js';
import { Drawer, Notice } from './components/UI.jsx';
import IdentityOverview from './screens/IdentityOverview.jsx';
import RoleChangeEvent from './screens/RoleChangeEvent.jsx';
import GovernanceDecision from './screens/GovernanceDecision.jsx';
import Fulfillment from './screens/Fulfillment.jsx';
import Evidence from './screens/Evidence.jsx';
import './styles/product-shell.css';

const navigation = [
  { title: 'Identity overview', label: 'Identity', icon: Users, component: IdentityOverview },
  { title: 'Lifecycle events', label: 'Lifecycle event', icon: GitBranch, component: RoleChangeEvent },
  { title: 'Access recommendations', label: 'Recommendations', icon: ShieldCheck, component: GovernanceDecision },
  { title: 'Provisioning', label: 'Provisioning', icon: ClipboardCheck, component: Fulfillment },
  { title: 'Audit trail', label: 'Audit trail', icon: Fingerprint, component: Evidence },
];

function initializeWorkspace() {
  const restored = restoreState({ getItem: key => window.localStorage.getItem(key) });
  return new URL(window.location.href).searchParams.get('reset') === '1' ? demoReducer(restored, { type: 'RESET' }) : restored;
}

export default function App() {
  const [state, dispatch] = useReducer(demoReducer, undefined, initializeWorkspace);
  const [screen, setScreen] = useState(0);
  const [resetEpoch, setResetEpoch] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('reset') === '1') {
      url.searchParams.delete('reset');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setStorageWarning(false); }
    catch { setStorageWarning(true); }
  }, [state]);
  const navigate = useCallback(index => { setScreen(index); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }); }, []);
  const closeGuide = useCallback(() => setGuideOpen(false), []);
  useEffect(() => {
    const handleShortcut = event => {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        dispatch({ type: 'RESET' });
        setResetEpoch(epoch => epoch + 1);
        setGuideOpen(false);
        navigate(0);
      } else if (event.key.toLowerCase() === 'g') {
        event.preventDefault();
        setGuideOpen(open => !open);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [navigate]);
  const Screen = navigation[screen].component;
  const stepsComplete = [true, state.evaluated, Boolean(state.applied), controlComplete(state), controlComplete(state)];
  const pendingApprovals = state.review === 'pending' ? 1 : 0;
  const openTasks = () => {
    if (pendingApprovals && !state.evaluated) dispatch({ type: 'EVALUATE' });
    navigate(2);
  };
  return <div className="app-layout">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <a className="brand" href="#" aria-label="Northstar Identity" onClick={e => { e.preventDefault(); navigate(0); }}>Northstar <span>Identity</span></a>
      <div className="tenant"><span className="tenant-logo">M</span><span><strong>Meridian Global</strong><small>Enterprise workspace</small></span><ChevronDown size={15} /></div>
      <div className="nav-label">GOVERNANCE WORKSPACE</div>
      <nav aria-label="Main navigation">{navigation.map((item, index) => <button key={item.title} className={`nav-item ${screen === index ? 'active' : ''}`} aria-label={item.title} aria-current={screen === index ? 'page' : undefined} onClick={() => navigate(index)}><item.icon size={19} strokeWidth={1.6} /><span>{item.title}</span>{index === 4 && state.evaluated && <span className="nav-indicator" />}</button>)}</nav>
      <div className="sidebar-tasks"><button className="nav-item" onClick={openTasks} aria-label={`My tasks · ${pendingApprovals} pending approvals`}><ListChecks size={19} strokeWidth={1.6} /><span>My tasks</span><span className="nav-count">{pendingApprovals}</span></button><small>{pendingApprovals ? '1 pending approval' : 'No pending approvals'}</small></div>
      <div className="sidebar-footer"><div className="user-footer"><span className="user-avatar">{REVIEWER.initials}</span><span><strong>{REVIEWER.name}</strong><small>{REVIEWER.role}</small></span><LockKeyhole size={14} /></div></div>
    </aside>
    {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <div className="workspace">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button><span className="mobile-brand">Northstar <span>Identity</span></span><Building2 size={16} /><span>Meridian Global</span><ChevronRight size={13} /><strong>{navigation[screen].title}</strong></div><div className="topbar-right"><span className="top-avatar" title={`${REVIEWER.name} · ${REVIEWER.role}`}>{REVIEWER.initials}</span></div></header>
      <div className="story-bar"><div className="story-person"><span className="story-avatar">SM</span><div><strong>Sarah Miller</strong><span>Finance Analyst <ArrowRight size={12} /> Finance Manager</span></div></div><div className="story-steps" aria-label="Access lifecycle">{navigation.map((n, i) => <React.Fragment key={n.label}>{i > 0 && <span className={`step-line ${stepsComplete[i - 1] ? 'done' : ''}`} />}<button className={`story-step ${i === screen ? 'current' : ''} ${stepsComplete[i] ? 'done' : ''}`} onClick={() => navigate(i)} aria-label={`Step ${i + 1}: ${n.title}`} aria-current={i === screen ? 'step' : undefined}><span className="step-circle">{stepsComplete[i] && i !== screen ? <Check size={12} /> : i + 1}</span><span>{n.label}</span></button></React.Fragment>)}</div><div className="effective-date"><span>Effective date</span><strong>{SCENARIO.effectiveDate}</strong></div></div>
      <main key={`${screen}-${resetEpoch}`} className="main-content">{storageWarning && <Notice tone="amber">Browser storage is unavailable. Reloading will clear this session’s progress.</Notice>}<Screen state={state} dispatch={dispatch} navigate={navigate} /></main>
      <footer className="app-footer"><span>Today: {state.fulfillmentStarted ? SCENARIO.workspaceAfter : SCENARIO.workspaceBefore} <span className="footer-dot">·</span> UTC</span></footer>
    </div>
    {guideOpen && <Drawer title="10-minute guide" subtitle="10 MINUTES" onClose={closeGuide}><ol className="guide-list"><li><strong>Identity · 1 min</strong><p>Inspect Sarah Miller’s current access and the Finance Operations Agent identity.</p></li><li><strong>Lifecycle event · 1 min</strong><p>Review the Workday mover event received Tuesday, 13 October 2026 at 09:00 UTC, effective Monday, 19 October 2026.</p></li><li><strong>Recommendations · 3 min</strong><p>Accept the standard recommendations in both tabs. Review the policy violation, enter a comment and approve SAP Payment Approval. Inspect the agent’s policy-locked permission, then apply the decisions.</p></li><li><strong>Provisioning · 2 min</strong><p>Provision the scheduled changes on 19 October. Inspect the automated results and the ServiceNow manual task due at 12:00 UTC, then confirm completion with a reference and verification note.</p></li><li><strong>Audit trail · 2 min</strong><p>Inspect recommended and decided actions, approver comments and provisioning records. View the five key records, expand all 14 records and export the audit trail.</p></li><li><strong>Outcomes · 1 min</strong><p>Discuss the access changes, the unresolved risks and the evidence recorded for each identity.</p></li></ol><Notice>Payment approval is restricted to human identities (POL-AI-303). It activates only after Accounts Receivable Operator is removed.</Notice></Drawer>}
  </div>;
}
