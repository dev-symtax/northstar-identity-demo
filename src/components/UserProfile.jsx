import React, { useEffect, useRef, useState } from 'react';
import { REVIEWER } from '../data/scenario.js';
import { Avatar } from './UI.jsx';

export default function UserProfile({ location }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = event => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const closeEscape = event => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [open]);
  return <div className={`user-profile ${location}`} ref={ref}>
    <button className={location === 'sidebar-profile' ? 'user-footer profile-trigger' : 'profile-trigger top-avatar'} aria-label={`Open Patrick Sena profile · ${location === 'sidebar-profile' ? 'sidebar' : 'header'}`} aria-expanded={open} onClick={() => setOpen(value => !value)} ref={triggerRef}>
      <Avatar name={REVIEWER.name} />{location === 'sidebar-profile' && <span><strong>{REVIEWER.name}</strong><small>{REVIEWER.role}</small></span>}
    </button>
    {open && <section className="profile-popover" role="dialog" aria-label="Patrick Sena profile"><Avatar name={REVIEWER.name} large /><h2>{REVIEWER.name}</h2><p>{REVIEWER.role}</p><dl><div><dt>Tenant</dt><dd>Meridian Global</dd></div><div><dt>Email</dt><dd>patrick.sena@meridianglobal.com</dd></div></dl></section>}
  </div>;
}
