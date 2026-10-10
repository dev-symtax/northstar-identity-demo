import patrickPhoto from '../assets/people/patrick-sena.jpg';
import sarahPhoto from '../assets/people/sarah-miller.jpg';

export const portraits = { 'Patrick Sena': patrickPhoto, 'Sarah Miller': sarahPhoto };

// Replace a null value with an imported, supplied official SVG or PNG asset.
export const applicationAssets = {
  sap: { slot: 'sap', asset: null },
  snow: { slot: 'servicenow', asset: null },
  workday: { slot: 'workday', asset: null },
  powerbi: { slot: 'microsoft-power-bi', asset: null },
  entra: { slot: 'microsoft-entra-id', asset: null },
};
