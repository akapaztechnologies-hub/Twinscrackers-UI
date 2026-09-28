import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

/**
 * index.html carries no shop name of its own.
 *
 * Placeholders like {{BRAND_NAME}} are filled from env at build time (set them
 * in Cloudflare Pages → Environment variables), and `brand-boot.js` is inlined
 * into <head> so the live, admin-edited brand replaces those defaults before
 * the first paint. Rebranding the store is then a settings change, not a code
 * change — and there is no old name left in the markup to flash.
 */
function brandHtml(env: Record<string, string>): Plugin {
  const siteUrl = (env.VITE_SITE_URL || '').replace(/\/+$/, '');
  const tokens: Record<string, string> = {
    BRAND_NAME: env.VITE_SITE_NAME || 'Fireworks Store',
    BRAND_TAGLINE: env.VITE_SITE_TAGLINE || 'Premium Fireworks for Every Celebration',
    BRAND_DESCRIPTION:
      env.VITE_SITE_DESCRIPTION ||
      'Premium fireworks for every celebration. Shop aerial shells, rockets, sparklers, and professional-grade fireworks with nationwide delivery.',
    BRAND_URL: siteUrl,
    BRAND_LOGO: env.VITE_SITE_LOGO || '/logo.png',
    BRAND_LOGO_ABSOLUTE: /^https?:/i.test(env.VITE_SITE_LOGO || '')
      ? env.VITE_SITE_LOGO
      : `${siteUrl}${env.VITE_SITE_LOGO || '/logo.png'}`,
    BRAND_THEME_COLOR: env.VITE_THEME_COLOR || '#0A0A0A',
    BRAND_KEYWORDS:
      env.VITE_SITE_KEYWORDS ||
      'fireworks, crackers, Diwali crackers, buy fireworks online, aerial shells, rockets, sparklers, fountains',
    BRAND_LOCALITY: env.VITE_SITE_LOCALITY || 'Sivakasi',
    BRAND_REGION_CODE: env.VITE_SITE_REGION_CODE || 'IN-TN',
  };

  const bootConfig = { api: env.VITE_API_URL || 'http://localhost:5000/api' };

  return {
    name: 'brand-html',
    transformIndexHtml(html) {
      const boot = fs.readFileSync(path.resolve(__dirname, 'brand-boot.js'), 'utf-8');
      return html
        .replace(/\{\{(\w+)\}\}/g, (match, key: string) => tokens[key] ?? match)
        .replace(
          '<!--BRAND_BOOT-->',
          `<script>window.__BRAND_BOOT_CFG__=${JSON.stringify(bootConfig)};\n${boot}</script>`,
        );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), brandHtml(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            animations: ['framer-motion'],
            state: ['zustand'],
          },
        },
      },
      target: 'es2020',
      minify: 'esbuild',
      cssMinify: true,
    },
    server: {
      port: 3000,
      open: true,
    },
  };
});
