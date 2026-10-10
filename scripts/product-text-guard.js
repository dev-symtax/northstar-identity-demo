import { parse } from '@babel/parser';

const forbidden = /\b(?:demo\w*|presenter\w*|synthetic|sample\w*|mock\w*|story|stories)\b|coming soon|Identity intelligence|Did we cover|Access starts with context|Every permission has a decision|Every decision has a reason|Consistent governance|Practical fulfillment|Explain the decision|Prove the control|Two distinct evidence trails|When business context changes|People\. Agents\. Applications\.|WHY THIS MATTERS TO MERIDIAN|Change is accelerating|Control must keep pace/i;
const internalAttributes = new Set(['className', 'class', 'id', 'key', 'ref', 'href', 'src', 'type', 'htmlFor', 'data-row-id']);
const visibleProperties = new Set(['children', 'title', 'subtitle', 'description', 'label', 'placeholder', 'aria-label', 'aria-description', 'alt', 'reason', 'why', 'method', 'status', 'comment']);

function propertyName(node) {
  return node?.name ?? node?.value;
}

export function assertProductText(value, location) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (forbidden.test(text)) throw new Error(`Presentation language in product text (${location}): ${text.slice(0, 180)}`);
}

function visit(node, visitor, parent) {
  if (!node || typeof node !== 'object') return;
  if (visitor(node, parent) === false) return;
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => visit(child, visitor, node));
    else if (value && typeof value === 'object') visit(value, visitor, node);
  }
}

export function checkSourceText(code, filename) {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  visit(ast, (node, parent) => {
    if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' && node.source) return false;
    // Storage keys and DOM/CSS identifiers are implementation details, not UI copy.
    if (node.type === 'VariableDeclarator' && node.id?.name === 'STORAGE_KEY') return false;
    if (node.type === 'JSXAttribute' && internalAttributes.has(propertyName(node.name))) return false;
    if (node.type === 'ObjectProperty' && internalAttributes.has(propertyName(node.key))) return false;
    if (node.type === 'JSXText') assertProductText(node.value, `${filename}:${node.loc.start.line}`);
    if (node.type === 'StringLiteral' && !(parent?.type === 'ObjectProperty' && parent.key === node)) assertProductText(node.value, `${filename}:${node.loc.start.line}`);
    if (node.type === 'TemplateElement') assertProductText(node.value.cooked ?? node.value.raw, `${filename}:${node.loc.start.line}`);
  });
}

export function checkBuiltText(code, filename) {
  const ast = parse(code, { sourceType: 'module' });
  visit(ast, node => {
    if (node.type !== 'ObjectProperty' || !visibleProperties.has(propertyName(node.key))) return;
    visit(node.value, child => {
      if (child.type === 'ObjectProperty' && internalAttributes.has(propertyName(child.key))) return false;
      if (child.type === 'StringLiteral') assertProductText(child.value, filename);
      if (child.type === 'TemplateElement') assertProductText(child.value.cooked ?? child.value.raw, filename);
    });
  });
}

export function checkHtmlText(html, filename) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)) checkBuiltText(match[1], filename);
  const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  assertProductText(markup.replace(/<[^>]+>/g, ' '), filename);
  for (const match of markup.matchAll(/(?:content|title|alt|aria-label)=["']([^"']*)["']/gi)) assertProductText(match[1], filename);
}

export function productTextGuard() {
  return {
    name: 'product-text-guard',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (/\/src\/.*\.[cm]?[jt]sx?$/.test(id.split('?')[0])) checkSourceText(code, id);
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const [filename, output] of Object.entries(bundle)) {
          if (output.type === 'chunk') checkBuiltText(output.code, filename);
          else if (filename.endsWith('.html')) checkHtmlText(String(output.source), filename);
        }
      },
    },
  };
}
