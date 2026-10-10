import { decisions } from '../data/catalog.js';
import { getAccessDecision } from './state.js';

const byId = Object.fromEntries(decisions.map(row => [row.id, row]));
const keyIds = ['h-payment', 'a-inbound', 'a-payment', 'h-legacy', 'a-legacy'];
export const isManualFulfillment = record => record.category === 'Controlled task';

export function auditRecords(state, type = 'decision', fullHistory = false) {
  const evidence = type === 'decision' ? state.decisionEvidence : state.fulfillmentEvidence;
  const latest = [...new Map(evidence.map(record => [record.rowId, record])).values()];
  return [...(fullHistory ? evidence : latest), ...state.manualFulfillmentEvidence];
}

export function filterAuditRecords(records, state, type, filter) {
  return records.filter(record => {
    if (isManualFulfillment(record)) return filter === 'all' || filter === 'manual';
    const row = byId[record.rowId];
    if (filter === 'key') return keyIds.includes(record.rowId);
    if (filter === 'overrides') return (type === 'decision' ? record.status : getAccessDecision(row, state).status) === 'Changed';
    if (filter === 'locked') return record.rowId === 'a-payment';
    if (filter === 'manual') return ['h-legacy', 'a-legacy'].includes(record.rowId) && getAccessDecision(row, state).decidedAction === 'REMOVE';
    return true;
  }).sort((a, b) => filter === 'key' ? keyIds.indexOf(a.rowId) - keyIds.indexOf(b.rowId) : 0);
}
