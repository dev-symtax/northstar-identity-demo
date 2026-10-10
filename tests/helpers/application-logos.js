import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

export const suppliedLogoFiles = {
  sap: 'SAP_2011_logo.svg',
  powerbi: 'New_Power_BI_Logo.svg',
  workday: 'Workday_logo.svg',
  ad: 'active-directory.svg',
  snow: 'ServiceNow_logo.svg',
  salesforce: 'Salesforce.com_logo.svg',
  m365: 'Microsoft_365_logo.svg',
  entra: 'Microsoft_Entra_ID_color_icon.svg',
};

export async function verifyLogoCatalog(page, { offline = false } = {}) {
  const sources = {};
  for (const [appId, filename] of Object.entries(suppliedLogoFiles)) {
    const tile = page.locator(`.workspace-records [data-application="${appId}"]`);
    await expect(tile).toHaveAttribute('data-asset-kind', 'official');
    const src = await tile.locator('img').getAttribute('src');
    let actual;
    if (src.startsWith('data:')) {
      const payload = src.slice(src.indexOf(',') + 1);
      actual = src.includes(';base64,') ? Buffer.from(payload, 'base64').toString('utf8') : decodeURIComponent(payload);
    } else {
      expect(offline).toBe(false);
      const url = new URL(src, page.url());
      expect(url.origin).toBe(new URL(page.url()).origin);
      const response = await page.request.get(url.href);
      expect(response.ok()).toBe(true);
      actual = await response.text();
    }
    const original = await readFile(new URL(`../../src/assets/logos/${filename}`, import.meta.url), 'utf8');
    // Compare XML elements, attributes and text after URL encoding. Quote and
    // whitespace normalization by Vite must not change the supplied artwork.
    const fingerprints = await page.evaluate(([original, actual]) => {
      const tree = element => ({
        tag: element.tagName,
        attrs: [...element.attributes].map(attr => [attr.name, attr.value.replace(/\s+/g, ' ').trim()]).sort(([a], [b]) => a.localeCompare(b)),
        children: [...element.childNodes].flatMap(node => node.nodeType === Node.ELEMENT_NODE ? [tree(node)] : node.nodeType === Node.TEXT_NODE && node.textContent.trim() ? [node.textContent.trim()] : []),
      });
      return [original, actual].map(svg => tree(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement));
    }, [original, actual]);
    expect(fingerprints[1], `${appId} must use ${filename}`).toEqual(fingerprints[0]);
    sources[appId] = src;
  }
  await assertLogoConsistency(page, sources, { offline });
  return sources;
}

export async function assertLogoConsistency(page, sources, { offline = false } = {}) {
  for (const [appId, source] of Object.entries(sources)) {
    const tiles = page.locator(`[data-application="${appId}"]`);
    for (const tile of await tiles.all()) {
      await expect(tile).toHaveAttribute('data-asset-kind', 'official');
      const logo = tile.locator('img');
      await expect(logo).toHaveAttribute('src', source);
      if (offline) expect(source).toMatch(/^data:image\/svg\+xml[;,]/);
      await expect.poll(() => logo.evaluate(img => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)).toBe(true);
      expect(await tile.evaluate(element => {
        const image = element.querySelector('img');
        const box = element.getBoundingClientRect();
        const imageBox = image.getBoundingClientRect();
        return box.width === 28 && box.height === 28 && imageBox.width === 22 && imageBox.height === 22 && getComputedStyle(image).objectFit === 'contain';
      })).toBe(true);
    }
  }
}
