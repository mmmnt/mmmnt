import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export const SITE_URL = 'https://moment.dev';

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  integrations: [
    sitemap({
      filter: (page) => !/\/design(\/|$)/.test(page) && !page.includes('/404'),
    }),
  ],
});
