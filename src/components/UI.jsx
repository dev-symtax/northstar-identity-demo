import React, { useEffect, useRef, useState } from 'react';
import { X, ArrowRight, Bot, Check, Info, ShieldCheck, ChevronRight, MessageSquare } from 'lucide-react';
import { portraits } from '../data/assets.js';

export function Badge({ children, tone, dot = true }) {
  const value = String(children);
  const inferred = /Not permitted|Policy-locked|Locked/.test(value) ? 'neutral' : /Remove|REMOVE|Removed|Denied|Not granted|Do not grant/.test(value) ? 'red' : /Review|REVIEW|Awaiting|pending|open|Scheduled|Needs review|High|Critical/.test(value) ? 'amber' : /Grant|GRANT|Granted|Approved|Retained|Keep|KEEP|Accepted|Active|Complete|Ready/.test(value) ? 'green' : 'neutral';
  return <span className={`badge ${tone || inferred}`}>{dot && <span className="badge-dot" />}{children}</span>;
}
export function Button({ children, variant = 'primary', icon: Icon, ...props }) {
  return <button className={`button ${variant}`} {...props}>{Icon && <Icon size={16} strokeWidth={1.8} />}{children}</button>;
}
export function PageTitle({ eyebrow, title, description, action }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="title-action">{action}</div>}</div>;
}
export function SectionTitle({ title, description, children }) {
  return <div className="section-title"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</div>;
}
export function Avatar({ name, large = false }) {
  return <span className={`avatar ${large ? 'large' : ''}`}>{portraits[name] ? <img src={portraits[name]} alt={name} /> : name.split(' ').map(s => s[0]).slice(0, 2).join('')}</span>;
}
export function Actor({ name }) {
  const identity = name?.split(' · ')[0];
  return <span className="actor-cell">{portraits[identity] && <Avatar name={identity} />}<span>{name || '—'}</span></span>;
}
export function AgentIcon({ name = 'Finance Operations Agent' }) {
  return <span className="agent-icon agent-tile" role="img" aria-label={`${name} · AI agent`} title={`${name} · AI agent`} data-identity-type="agent"><Bot size={18} strokeWidth={1.5} aria-hidden="true" /></span>;
}
export function AgentName({ children = 'Finance Operations Agent' }) {
  return <span className="agent-name"><AgentIcon /><span>{children}</span></span>;
}
export function CommentTooltip({ comment }) {
  const [open, setOpen] = useState(false);
  return <span className="comment-tooltip"><button type="button" className="icon-button" aria-label={`Review comment: ${comment}`} title={comment} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}><MessageSquare size={18} /></button>{open && <span role="tooltip">{comment}</span>}</span>;
}
export function Empty({ title, children, onAction, action = 'View lifecycle event' }) {
  return <div className="empty-state"><div className="empty-icon"><ShieldCheck size={30} strokeWidth={1.3} /></div><h2>{title}</h2><p>{children}</p>{onAction && <Button icon={ArrowRight} onClick={onAction}>{action}</Button>}</div>;
}
export function Notice({ children, tone = 'blue', icon: Icon = Info }) {
  return <div className={`notice ${tone}`}><Icon size={18} strokeWidth={1.8} /><div>{children}</div></div>;
}
export function Drawer({ title, subtitle, children, onClose, preserveScroll = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const scrollPosition = { left: window.scrollX, top: window.scrollY };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const handler = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const elements = ref.current.querySelectorAll('button:not(:disabled), input, textarea, select, [tabindex="0"]');
        if (!elements.length) { e.preventDefault(); return; }
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handler);
      if (preserveScroll && before?.isConnected) { before.focus({ preventScroll: true }); window.scrollTo({ ...scrollPosition, behavior: 'instant' }); }
      else before?.focus();
    };
  }, [onClose, preserveScroll]);
  return <div className="drawer-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><aside className="drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><div className="drawer-heading"><div><div className="eyebrow">{subtitle}</div><h2>{title}</h2></div><button className="icon-button" aria-label="Close details" onClick={onClose}><X size={20} /></button></div><div className="drawer-content">{children}</div></aside></div>;
}
export function Field({ label, children }) { return <div className="detail-field"><dt>{label}</dt><dd>{children}</dd></div>; }
export function Stat({ label, value, detail, icon: Icon }) { return <div className="stat"><div className="stat-label">{label}{Icon && <Icon size={16} />}</div><strong>{value}</strong><span>{detail}</span></div>; }
export function TextLink({ children, onClick }) { return <button className="text-link" onClick={onClick}>{children}<ChevronRight size={14} /></button>; }
export function Checklist({ children }) { return <div className="checkline"><Check size={15} />{children}</div>; }
export function formatTime(value) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
}
