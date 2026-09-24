import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'mobile', 'www');
const files = [
  'index.html', 'auth-callback.html', 'style.css', 'feed.css', 'composer.css', 'apple-polish.css',
  'experience-refresh.css', 'workspace.css', 'profile-refresh.css', 'interaction-refresh.css', 'scan-refresh.css', 'refinement.css',
  'app.js', 'composer.js', 'navigation.js', 'shared-links.js', 'native-bridge.js', 'icons.js', 'app-update.json',
  'supabase-config.js', 'logo.svg', 'site.webmanifest',
  'assets/fonts/abask-regular.ttf', 'assets/brand/favicon-32.png', 'assets/brand/favicon-192.png',
  'assets/brand/favicon-512.png', 'assets/brand/apple-touch-icon.png', 'assets/brand/evenit-wordmark.png'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map(async file => {
  const destination=resolve(output,file);
  await mkdir(dirname(destination),{recursive:true});
  await cp(resolve(root,file),destination);
}));
