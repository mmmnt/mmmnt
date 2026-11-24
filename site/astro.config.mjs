import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export const SITE_URL = 'https://moment.mmmnt.ai';

// The /design pages are working studies. `astro dev` serves them; a production build drops them.
const dropDesignPages = {
  name: 'drop-design-pages',
  hooks: {
    'astro:build:done': async ({ dir, logger }) => {
      await rm(new URL('design/', dir), { recursive: true, force: true });
      logger.info(`removed ${fileURLToPath(new URL('design/', dir))}`);
    },
  },
};

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
    dropDesignPages,
  ],
});
