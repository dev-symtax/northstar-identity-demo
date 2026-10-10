import React, { useCallback, useState } from 'react';
import { ArrowRight, BarChart3, CheckCircle2 } from 'lucide-react';
import { workspacePages, pageRows, sourceSummary, lifecycleEvents, isActionableTask } from '../data/workspace.js';
import { entitlements, policies } from '../data/catalog.js';
import { portraits } from '../data/assets.js';
import { lifecycleStatus } from '../demo/state.js';
import { ApplicationName } from '../components/ApplicationIcon.jsx';
import { Actor, Avatar, Badge, Button, Drawer, Field, PageTitle, SectionTitle, Stat } from '../components/UI.jsx';

function Value({ field, row }) {
  if (field === 'appId') return row.appId ? <ApplicationName appId={row.appId} /> : <span>AI agents</span>;
  if (field === 'scope' && row.appIds) return <span className="application-list">{row.appIds.map(id => <ApplicationName key={id} appId={id} />)}</span>;
  if (field === 'status') return <Badge>{row.status}</Badge>;
  if (field === 'progress') return <div className="campaign-progress"><span>{row.progress}% · {row.reviewed} of {row.total}</span><progress value={row.progress} max="100" aria-label={`${row.name} progress`} /></div>;
  if (field === 'transition') return <span>{row.from} → {row.to}</span>;
  if (['owner', 'reviewer'].includes(field) && row[field] === 'Patrick Sena') return <Actor name={row[field]} />;
  if (['name', 'subject', 'owner', 'reviewer'].includes(field) && portraits[row[field]]) return <span className="person-cell"><Avatar name={row[field]} />{row[field]}</span>;
  return <span>{row[field] ?? '—'}</span>;
}

export default function WorkspacePage({ page, state, navigate }) {
  const config = workspacePages[page];
  const [filter, setFilter] = useState('All');
  const [detail, setDetail] = useState(null);
  const close = useCallback(() => setDetail(null), []);
  const allRows = pageRows(page, state);
  const rows = page === 'events' && filter !== 'All' ? allRows.filter(row => row.type === filter) : allRows;
  const openTasks = page === 'tasks' ? allRows.filter(isActionableTask) : [];
  const open = row => page === 'events' && row.identity === 'sarah' ? navigate('sarah') : setDetail(row);
  const primary = () => {
    if (page === 'tasks') {
      const task = openTasks[0];
      if (!task) return;
      const event = lifecycleEvents.find(event => event.id === task.linkedEvent);
      return event?.identity === 'sarah' ? navigate('sarah') : setDetail(task);
    }
    return ['events', 'workday', 'audit'].includes(page) ? navigate('sarah') : setDetail(rows[0]);
  };
  const showPrimaryAction = page === 'tasks' ? openTasks.length > 0 : page !== 'events' || lifecycleStatus(state) !== 'Completed';
  const recordSummary = page === 'applications' ? '12 applications · 40 entitlements' : `${rows.length} records${page === 'tasks' ? ` · ${openTasks.length} open ${openTasks.length === 1 ? 'task' : 'tasks'}` : ''}`;
  return <div className={`workspace-page ${page}-page`}>
    <PageTitle eyebrow={config.eyebrow} title={config.title} description={config.description} action={showPrimaryAction && <Button icon={ArrowRight} onClick={primary}>{config.action}</Button>} />
    {page === 'workday' && <div className="source-summary"><div className="notice blue"><CheckCircle2 size={20} /><div><strong>Source synchronized</strong><p>Last sync: {sourceSummary.lastSync} · Last event: WD-MOV-2026-0842</p></div></div><div className="stats-row four"><Stat label="Identities" value="48" detail="Workday records" /><Stat label="Applications" value="12" detail="40 entitlements" /><Stat label="AI agents" value="4" detail="Active" /><Stat label="Mover events" value="4" detail="3 joiners · 2 leavers" /></div></div>}
    {page === 'reports' && <section className="report-charts" aria-label="Program reports">{config.rows.map((row, index) => <button className="panel report-chart" key={row.id} onClick={() => setDetail(row)}><BarChart3 size={20} /><h2>{row.name}</h2><strong>{row.value}</strong><p>Target {row.target} · {row.scope}</p><div className="report-track" role="img" aria-label={`${row.name}: ${row.value}, target ${row.target}`}><span style={{ width: row.value }} /><i style={{ left: `${parseFloat(row.target)}%` }} /></div></button>)}</section>}
    {page === 'events' && <div className="filter-chips" aria-label="Lifecycle event type">{['All', 'Joiner', 'Mover', 'Leaver'].map(type => <button key={type} aria-pressed={filter === type} className={filter === type ? 'active' : ''} onClick={() => setFilter(type)}>{type}<span>{type === 'All' ? allRows.length : allRows.filter(row => row.type === type).length}</span></button>)}</div>}
    <section className="panel workspace-records"><SectionTitle title={page === 'events' ? 'Lifecycle events' : 'Records'} description={recordSummary} />
      <table><thead><tr>{config.columns.map(([key, title]) => <th key={key}>{title}</th>)}<th><span className="sr-only">Details</span></th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className={row.identity === 'sarah' && row.status === 'Needs decision' ? 'attention-row' : ''} data-record-id={row.id} onClick={() => open(row)}>{config.columns.map(([field], index) => <td key={field}>{index === 0 ? <button className="table-link record-link" onClick={event => { event.stopPropagation(); open(row); }}><Value field={field} row={row} /></button> : <Value field={field} row={row} />}</td>)}<td><button className="icon-button" aria-label={`View ${row.name || row.id}`} onClick={event => { event.stopPropagation(); open(row); }}><ArrowRight size={16} /></button></td></tr>)}</tbody></table>
    </section>
    {detail && <Drawer title={detail.name || detail.id} subtitle={`${config.title.toUpperCase()} · ${detail.id}`} onClose={close}>
      {detail.identity && <Avatar name={detail.name} large />}
      {detail.appId && <div className="drawer-application"><ApplicationName appId={detail.appId} /></div>}
      <dl>{Object.entries(detail).filter(([key]) => !['appId', 'appIds', 'resources', 'departments', 'identity', 'conflict'].includes(key)).map(([key, value]) => <Field key={key} label={({ id: 'Reference', name: 'Name', policy: 'Governing policy', lastSync: 'Last sync', entitlementCount: 'Entitlements', permissionCount: 'Permissions', updated: 'Last updated', from: 'Previous role', to: 'New role', linkedEvent: 'Linked event' })[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase())}>{key === 'owner' && value === 'Patrick Sena' ? <Actor name={value} /> : Array.isArray(value) ? value.join(', ') : String(value)}</Field>)}</dl>
      {detail.appIds && <div className="application-list">{detail.appIds.map(appId => <ApplicationName key={appId} appId={appId} />)}</div>}
      {page === 'applications' && <><h3>Registered entitlements</h3><ul className="detail-list">{entitlements.filter(item => item.app === detail.id).map(item => <li key={item.id}>{item.name}</li>)}</ul></>}
      {page === 'agents' && <><h3>Agent permissions</h3><ul className="detail-list">{detail.resources.map(id => <li key={id}>{entitlements.find(item => item.id === id)?.name}</li>)}</ul></>}
      {page === 'policies' && <p>{policies.find(policy => policy.id === detail.id)?.description || detail.description}</p>}
    </Drawer>}
  </div>;
}
