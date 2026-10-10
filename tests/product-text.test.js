import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSourceText, checkBuiltText, checkHtmlText } from '../scripts/product-text-guard.js';

test('source guard rejects presentation copy, accessible labels and conditional text', () => {
  for (const code of ['const view = <p>Reset demo</p>;', 'const view = <button aria-label="Presenter guide" />;', 'const view = <p>{ok ? "Ready" : "Synthetic data"}</p>;', 'const reason = `Use sample evidence`;']) {
    assert.throws(() => checkSourceText(code, 'screen.jsx'), /Presentation language/);
  }
});

test('source guard allows internal storage keys, import paths and style identifiers', () => {
  assert.doesNotThrow(() => checkSourceText('import { state } from "./demo/state.js"; const STORAGE_KEY = "northstar-identity-demo-v1"; const view = <p className="story-bar">Identity overview</p>;', 'screen.jsx'));
});

test('built guard checks rendered and accessible properties without banning library diagnostics', () => {
  assert.throws(() => checkBuiltText('jsx("p", {children: "NEXT IN THE STORY"})', 'index.js'), /Presentation language/);
  assert.throws(() => checkBuiltText('jsx("button", {"aria-label": "Reset demo"})', 'index.js'), /Presentation language/);
  assert.doesNotThrow(() => checkBuiltText('const diagnostic = "synthetic event"; jsx("p", {className: "story-bar", children: "Audit trail"})', 'index.js'));
  assert.doesNotThrow(() => checkBuiltText('jsx("main", {children: [jsx("p", {className: "story-bar", children: "Audit trail"})]})', 'index.js'));
});

test('HTML guard checks titles, metadata and inlined rendered JavaScript', () => {
  assert.throws(() => checkHtmlText('<meta name="description" content="Identity demo">', 'index.html'), /Presentation language/);
  assert.throws(() => checkHtmlText('<script type="module">jsx("p", {children:"Did we cover the outcomes?"})</script>', 'index.html'), /Presentation language/);
});
