import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowRight, BarChart3, Bot, Building2, Check, ChevronDown, ChevronRight, ClipboardCheck, FileCheck2, Fingerprint, GitBranch, Layers, LayoutDashboard, ListChecks, Menu, Network, ShieldCheck, Users } from 'lucide-react';
import { demoReducer, restoreState, STORAGE_KEY, controlComplete, sarahResumeTarget } from './demo/state.js';
import { SCENARIO } from './data/scenario.js';
import { Avatar, Drawer, Notice } from './components/UI.jsx';
import UserProfile from './components/UserProfile.jsx';
import IdentityOverview from './screens/IdentityOverview.jsx';
import RoleChangeEvent from './screens/RoleChangeEvent.jsx';
import GovernanceDecision from './screens/GovernanceDecision.jsx';
import Fulfillment from './screens/Fulfillment.jsx';
import Evidence from './screens/Evidence.jsx';
import WorkspacePage from './screens/WorkspacePage.jsx';
import { actionableTasks, workspacePages } from './data/workspace.js';
import './styles/product-shell.css';

const steps = [
  { key: 'overview', title: 'Overview', label: 'Identity' },
  { key: 'events', title: 'Lifecycle events', label: 'Lifecycle event' },
  { key: 'recommendations', title: 'Access recommendations', label: 'Recommendations' },
  { key: 'provisioning', title: 'Provisioning', label: 'Provisioning' },
  { key: 'audit', title: 'Audit trail', label: 'Audit trail' },
];
const groups = [
  { title: 'Workspace', items: [['overview', 'Overview', LayoutDashboard], ['tasks', 'My tasks', ListChecks]] },
  { title: 'Identity lifecycle', items: [['events', 'Lifecycle events', GitBranch], ['requests', 'Access requests', ClipboardCheck], ['certifications', 'Access certifications', FileCheck2]] },
  { title: 'Governance', items: [['policies', 'Policies', ShieldCheck], ['roles', 'Roles', Layers], ['agents', 'AI agents', Bot]] },
  { title: 'Integrations', items: [['applications', 'Applications', Building2], ['connectors', 'Connectors', Network], ['workday', 'Workday source', Users]] },
  { title: 'Monitoring', items: [['audit', 'Audit trail', Fingerprint], ['reports', 'Reports', BarChart3]] },
];
const screens = { overview: IdentityOverview, event: RoleChangeEvent, recommendations: GovernanceDecision, provisioning: Fulfillment, audit: Evidence };
const titles = { overview: 'Overview', event: 'Lifecycle event', recommendations: 'Access recommendations', provisioning: 'Provisioning', audit: 'Audit trail' };

function initializeWorkspace() {
  const restored = restoreState({ getItem: key => window.localStorage.getItem(key) });
  return new URL(window.location.href).searchParams.get('reset') === '1' ? demoReducer(restored, { type: 'RESET' }) : restored;
}
export default function App() {
  const [state, dispatch] = useReducer(demoReducer, undefined, initializeWorkspace);
  const [screen, setScreen] = useState('overview');
  const [workflow, setWorkflow] = useState(false);
  const [resetEpoch, setResetEpoch] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [completionNotice, setCompletionNotice] = useState('');
  const previousLegacyStatus = useRef(state.legacyTask?.status ?? null);
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
  const navigate = useCallback(target => {
    const destination = target === 'sarah' ? sarahResumeTarget(state) : typeof target === 'number' ? steps[target].key : target;
    setWorkflow(target === 'sarah' || target === 4 || ['event', 'recommendations', 'provisioning'].includes(destination));
    setScreen(destination); setMenuOpen(false); setCompletionNotice(''); window.scrollTo({ top: 0, behavior: 'instant' });
  }, [state]);
  useEffect(() => {
    const status = state.legacyTask?.status ?? null;
    const justCompleted = previousLegacyStatus.current === 'Task open' && status === 'Completed';
    previousLegacyStatus.current = status;
    if (justCompleted && controlComplete(state)) {
      navigate(1);
      setCompletionNotice('Manual task completed. Sarah Miller’s role change is now complete.');
    }
  }, [state, navigate]);
  useEffect(() => {
    if (!completionNotice) return;
    const timer = setTimeout(() => setCompletionNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [completionNotice]);
  const closeGuide = useCallback(() => setGuideOpen(false), []);
  useEffect(() => {
    const handleShortcut = event => {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault(); dispatch({ type: 'RESET' }); setResetEpoch(epoch => epoch + 1); setGuideOpen(false); navigate(0);
      } else if (event.key.toLowerCase() === 'g') { event.preventDefault(); setGuideOpen(open => !open); }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [navigate]);
  const Screen = screens[screen];
  const title = titles[screen] || workspacePages[screen].title;
  const stepIndex = screen === 'event' ? 1 : steps.findIndex(step => step.key === screen);
  const selectedNavigation = ['event', 'recommendations', 'provisioning'].includes(screen) ? 'events' : screen;
  const stepsComplete = [true, state.evaluated, Boolean(state.applied), controlComplete(state), controlComplete(state)];
  const openTaskCount = actionableTasks(state).length;
  return <div className="app-layout">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <a className="brand" href="#" aria-label="Northstar Identity" onClick={event => { event.preventDefault(); navigate(0); }}>Northstar <span>Identity</span></a>
      <div className="tenant"><span className="tenant-logo">M</span><span><strong>Meridian Global</strong><small>Enterprise workspace</small></span><ChevronDown size={15} /></div>
      <nav aria-label="Main navigation">{groups.map(group => <div className="navigation-group" key={group.title}><div className="nav-label">{group.title}</div>{group.items.map(([key, name, Icon]) => <button key={key} className={`nav-item ${selectedNavigation === key ? 'active' : ''}`} aria-label={name} aria-current={selectedNavigation === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon size={19} strokeWidth={1.6} /><span>{name}</span>{key === 'tasks' && <span className="nav-count">{openTaskCount}</span>}</button>)}</div>)}</nav>
      <div className="sidebar-footer"><UserProfile location="sidebar-profile" /></div>
    </aside>
    {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <div className="workspace">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button><span className="mobile-brand">Northstar <span>Identity</span></span><Building2 size={16} /><span>Meridian Global</span><ChevronRight size={13} />{workflow && <><span>Sarah Miller</span><ChevronRight size={13} /></>}<strong>{title}</strong></div><div className="topbar-right"><UserProfile location="header-profile" /></div></header>
      {workflow && <div className="story-bar"><div className="story-person"><Avatar name="Sarah Miller" /><div><strong>Sarah Miller</strong><span>Finance Analyst <ArrowRight size={12} /> Finance Manager</span></div></div><div className="story-steps" aria-label="Access lifecycle">{steps.map((step, index) => <React.Fragment key={step.key}>{index > 0 && <span className={`step-line ${stepsComplete[index - 1] ? 'done' : ''}`} />}<button className={`story-step ${index === stepIndex ? 'current' : ''} ${stepsComplete[index] ? 'done' : ''}`} onClick={() => navigate(index === 1 ? 'event' : index)} aria-label={`Step ${index + 1}: ${step.title}`} aria-current={index === stepIndex ? 'step' : undefined}><span className="step-circle">{stepsComplete[index] && index !== stepIndex ? <Check size={12} /> : index + 1}</span><span>{step.label}</span></button></React.Fragment>)}</div><div className="effective-date"><span>Effective date</span><strong>{SCENARIO.effectiveDate}</strong></div></div>}
      <main key={`${screen}-${resetEpoch}`} className="main-content">{completionNotice && <div className="recorded-toast" role="status">{completionNotice}</div>}{storageWarning && <Notice tone="amber">Browser storage is unavailable. Reloading will clear this session’s progress.</Notice>}{Screen ? <Screen state={state} dispatch={dispatch} navigate={navigate} workflow={workflow} /> : <WorkspacePage page={screen} state={state} navigate={navigate} />}</main>
      <footer className="app-footer"><span>Today: {SCENARIO.workspaceBefore} <span className="footer-dot">·</span> UTC</span></footer>
    </div>
    {guideOpen && <Drawer title="10-minute guide" subtitle="10 MINUTES" onClose={closeGuide}><ol className="guide-list"><li><strong>Identity · 1 min</strong><p>Inspect Sarah Miller’s current access and the Finance Operations Agent identity.</p></li><li><strong>Lifecycle event · 1 min</strong><p>Open Lifecycle events and select Sarah Miller. Review the Workday mover event received Tuesday, 13 October 2026 at 09:00 UTC, effective Monday, 19 October 2026.</p></li><li><strong>Recommendations · 3 min</strong><p>Accept the standard recommendations in both tabs, including ServiceNow Employee Self Service and Finance Request Approver. Review the policy violation, enter a comment and approve SAP Payment Approval. Inspect the agent’s policy-locked permission, then apply the decisions.</p></li><li><strong>Provisioning · 2 min</strong><p>Run scheduled provisioning on 19 October at 08:00 UTC. Inspect the automated results and the ServiceNow manual task due at 12:00 UTC. Continue to Audit trail even while the manual task is open.</p></li><li><strong>Audit trail · 2 min</strong><p>Inspect all records, the five key controls, policy details and provisioning records. Return to Lifecycle events and reopen Sarah to resume the open task. Confirm completion with a reference and verification note. Completion returns automatically to Lifecycle events and shows Sarah as Completed. Reopen Sarah to inspect her audit history. Export the audit trail if needed.</p></li><li><strong>Outcomes · 1 min</strong><p>Discuss the access changes, the unresolved risks and the evidence recorded for each identity.</p></li></ol><Notice>Payment approval is restricted to human identities (POL-AI-303). It activates only after Accounts Receivable Operator is removed.</Notice></Drawer>}
  </div>;
}
