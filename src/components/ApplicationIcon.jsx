import React from 'react';
import { BarChart3, BriefcaseBusiness, Database, FileText, Headset, Landmark, Network, Package, ShieldCheck, Users } from 'lucide-react';
import { applicationAssets } from '../data/assets.js';
import { applicationById } from '../data/catalog.js';

const icons = { sap: Landmark, powerbi: BarChart3, finance: Landmark, legacy: Database, workday: Users, entra: ShieldCheck, ad: Network, snow: Headset, salesforce: BriefcaseBusiness, m365: FileText, warehouse: Package, legal: FileText };
const initials = { sap: 'SAP', powerbi: 'BI', finance: 'FH', legacy: 'DB', workday: 'WD', entra: 'ID', ad: 'AD', snow: 'SN', salesforce: 'SF', m365: '365', warehouse: 'WH', legal: 'LV' };

export function ApplicationIcon({ appId }) {
  const app = applicationById[appId];
  if (!app) return null;
  const asset = applicationAssets[appId]?.asset;
  const Icon = icons[appId] || FileText;
  return <span className="application-tile" data-application={appId} data-asset-kind={asset ? 'official' : 'category'} title={app.name}>
    {asset ? <img src={asset} alt={`${app.name} logo`} /> : <><Icon size={16} aria-hidden="true" /><span className="application-initials" aria-hidden="true">{initials[appId]}</span></>}
  </span>;
}

export function ApplicationName({ appId, indicator = true }) {
  const app = applicationById[appId];
  if (!app) return <span>AI agent</span>;
  return <span className="application-name"><ApplicationIcon appId={appId} /><span>{app.name}{indicator && <small className={`connection-indicator ${app.mode === 'API' ? 'connected' : 'manual'}`}>{app.mode === 'API' ? 'Connected' : 'Manual'}</small>}</span></span>;
}
