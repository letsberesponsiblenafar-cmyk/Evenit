import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'mobile', 'www');
const files = [
  'index.html', 'style.css', 'feed.css', 'composer.css', 'apple-polish.css',
  'experience-refresh.css', 'app.js', 'composer.js', 'navigation.js', 'native-bridge.js', 'app-update.json',
  'supabase-config.js', 'logo.svg'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map(file => cp(resolve(root, file), resolve(output, file))));
