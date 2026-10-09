import React, { useCallback, useEffect, useLayoutEffect, useReducer, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, Bot, Building2, Check, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, Fingerprint, GitBranch, LayoutDashboard, LockKeyhole, Menu, RotateCcw, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { demoReducer, restoreState, STORAGE_KEY, controlComplete, readiness } from './demo/state.js';
import { Badge, Button, Drawer, Notice } from './components/UI.jsx';
import IdentityOverview from './screens/IdentityOverview.jsx';
import RoleChangeEvent from './screens/RoleChangeEvent.jsx';
import GovernanceDecision from './screens/GovernanceDecision.jsx';
import Fulfillment from './screens/Fulfillment.jsx';
import Evidence from './screens/Evidence.jsx';

const navigation = [
  { title: 'Identity overview', label: 'Identity', icon: Users, component: IdentityOverview },
  { title: 'Role change event', label: 'Event', icon: GitBranch, component: RoleChangeEvent },
  { title: 'Governance decision', label: 'Decision', icon: ShieldCheck, component: GovernanceDecision },
  { title: 'Fulfillment', label: 'Fulfillment', icon: ClipboardCheck, component: Fulfillment },
  { title: 'Evidence', label: 'Evidence', icon: Fingerprint, component: Evidence },
];
export default function App() {
  const [state, dispatch] = useReducer(demoReducer, undefined, () => restoreState({ getItem: key => window.localStorage.getItem(key) }));
  const [screen, setScreen] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [screen]);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setStorageWarning(false); }
    catch { setStorageWarning(true); }
  }, [state]);
  const navigate = useCallback(index => { setScreen(index); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }); }, []);
  const closeReset = useCallback(() => setResetOpen(false), []);
  const closeGuide = useCallback(() => setGuideOpen(false), []);
  const Screen = navigation[screen].component;
  const stepsComplete = [true, state.evaluated, state.evaluated && state.review !== 'pending', controlComplete(state), controlComplete(state) && state.review !== 'pending'];
  return <div className="app-layout">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate(0); }}><span className="brand-mark"><Sparkles size={25} strokeWidth={1.6} /></span><span>northstar<span className="brand-subtitle">IDENTITY</span></span></a>
      <div className="tenant"><span className="tenant-logo">M</span><span><strong>Meridian Global</strong><small>Enterprise workspace</small></span><ChevronDown size={15} /></div>
      <div className="nav-label">GOVERNANCE WORKSPACE</div>
      <nav aria-label="Main navigation">{navigation.map((item, index) => <button key={item.title} className={`nav-item ${screen === index ? 'active' : ''}`} aria-label={item.title} aria-current={screen === index ? 'page' : undefined} onClick={() => navigate(index)}><item.icon size={19} strokeWidth={1.6} /><span>{item.title}</span>{index === 1 && <span className="nav-count">4</span>}{index === 4 && state.evaluated && <span className="nav-indicator" />}</button>)}</nav>
      <div className="sidebar-note"><div className="sidebar-note-icon"><Activity size={16} /> BUSINESS CONTEXT</div><p>When roles change,<br />access changes with them.</p><small>People. Agents. Applications.</small></div>
      <div className="sidebar-footer"><div className="environment-indicator"><span />Local demo environment</div><button onClick={() => setGuideOpen(true)}><CircleHelp size={16} />Presenter guide<ChevronRight size={14} /></button><div className="user-footer"><span className="user-avatar">PL</span><span><strong>Patrick Lewis</strong><small>Identity Governance</small></span><LockKeyhole size={14} /></div></div>
    </aside>
    {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <div className="workspace">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button><Building2 size={16} /><span>Meridian Global</span><ChevronRight size={13} /><strong>{navigation[screen].title}</strong></div><div className="topbar-right"><span className="demo-tag">SYNTHETIC DATA</span><Button variant="ghost" icon={RotateCcw} onClick={() => setResetOpen(true)}>Reset demo</Button><span className="top-avatar">PL</span></div></header>
      <div className="story-bar"><div className="story-person"><span className="story-avatar">SM</span><div><strong>Sarah Miller</strong><span>Finance Analyst <ArrowRight size={12} /> Finance Manager</span></div></div><div className="story-steps" aria-label="Demo progress">{navigation.map((n, i) => <React.Fragment key={n.label}>{i > 0 && <span className={`step-line ${stepsComplete[i - 1] ? 'done' : ''}`} />}<button className={`story-step ${i === screen ? 'current' : ''} ${stepsComplete[i] ? 'done' : ''}`} onClick={() => navigate(i)} aria-label={`Step ${i + 1}: ${n.title}`} aria-current={i === screen ? 'step' : undefined}><span className="step-circle">{stepsComplete[i] && i !== screen ? <Check size={12} /> : i + 1}</span><span>{n.label}</span></button></React.Fragment>)}</div><div className="effective-date"><span>Effective date</span><strong>Mon, 12 Oct 2026</strong></div></div>
      <main key={screen} className="main-content">{storageWarning && <Notice tone="amber">Browser storage is unavailable. This session still works, but reloading will reset progress.</Notice>}<Screen state={state} dispatch={dispatch} navigate={navigate} /></main>
      <footer className="app-footer"><span>Northstar Identity <span className="footer-dot">·</span> Fictional enterprise demonstration</span><span>Scenario clock: {state.fulfillmentStarted ? '12 Oct 2026 · Monday' : '09 Oct 2026 · Friday'} <span className="footer-dot">·</span> UTC</span></footer>
    </div>
    {resetOpen && <Drawer title="Reset the demo?" subtitle="DEMO CONTROLS" onClose={closeReset}><p className="drawer-intro">Restore Sarah’s original access, clear approvals and fulfillment records, and return to the identity overview.</p><Notice>This resets only the local fictional scenario. It does not affect any real system.</Notice><div className="dialog-actions"><Button variant="secondary" onClick={closeReset}>Keep current state</Button><Button icon={RotateCcw} onClick={() => { dispatch({ type: 'RESET' }); setResetOpen(false); navigate(0); }}>Reset to start</Button></div></Drawer>}
    {guideOpen && <Drawer title="One event. One governance story." subtitle="PRESENTER GUIDE · 12 MINUTES" onClose={closeGuide}><p className="drawer-intro">Meridian already has governance. Validate how its operating model can keep pace with workforce change and AI adoption.</p><ol className="guide-list"><li><strong>Identity · 2 min</strong><p>Introduce Sarah’s access and the agent acting on her behalf.</p></li><li><strong>Event · 2 min</strong><p>Workday changes the business context. Evaluate the Monday move.</p></li><li><strong>Decision · 3 min</strong><p>Show keep, grant, remove and review. Approve Sarah’s payment exception. Show that the agent remains blocked.</p></li><li><strong>Fulfillment · 2 min</strong><p>Run the effective-date simulation. Contrast API execution with the controlled legacy task. Record sample completion evidence.</p></li><li><strong>Evidence · 2 min</strong><p>Separate why a decision was made from proof that the control completed.</p></li><li><strong>Validate outcomes · 1 min</strong><p>Appropriate access, productive movers, one governance model.</p></li></ol><Notice>All approvals, connectors, tickets and evidence are simulated locally. Payment approval is an additional privilege; pending review does not block core-role productivity.</Notice></Drawer>}
  </div>;
}
