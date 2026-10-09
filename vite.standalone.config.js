import { readFileSync } from 'node:fs';
import { defineConfig, mergeConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import appConfig from './vite.config.js';

const fontLicense = readFileSync(new URL('./public/fonts/PLUS-JAKARTA-SANS-LICENSE.txt', import.meta.url), 'utf8');

export default mergeConfig(appConfig, defineConfig({
  plugins: [
    viteSingleFile({ removeViteModuleLoader: true }),
    {
      name: 'standalone-license-and-output',
      transformIndexHtml() {
        return [{
          tag: 'script',
          attrs: { id: 'plus-jakarta-sans-license', type: 'application/json' },
          children: JSON.stringify({ license: fontLicense }).replaceAll('<', '\\u003c'),
          injectTo: 'head',
        }];
      },
      generateBundle: {
        order: 'post',
        handler(_options, bundle) {
          if (Object.keys(bundle).length !== 1 || !bundle['index.html']) {
            this.error('The standalone build must emit only index.html; an asset was not inlined.');
          }
        },
      },
    },
  ],
  build: {
    outDir: 'dist-standalone',
    copyPublicDir: false,
    modulePreload: { polyfill: false },
  },
}));
