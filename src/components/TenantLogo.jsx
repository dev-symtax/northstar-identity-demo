import React from 'react';
import { tenantAssets } from '../data/assets.js';

export default function TenantLogo() {
  const { asset, name, width, mark } = tenantAssets.meridian;
  return <span className="tenant-logo"><img src={asset} alt={name} style={{
    width: `${width / mark.size * 100}%`, left: `${-mark.x / mark.size * 100}%`, top: `${-mark.y / mark.size * 100}%`,
  }} /></span>;
}
