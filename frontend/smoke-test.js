import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const indexHtml = path.join(distDir, 'index.html');

console.log('Running frontend smoke test...');

if (!fs.existsSync(indexHtml)) {
  console.error('FAIL: dist/index.html was not generated.');
  process.exit(1);
}

const htmlContent = fs.readFileSync(indexHtml, 'utf8');

if (!htmlContent.includes('id="root"')) {
  console.error('FAIL: dist/index.html missing #root mounting container.');
  process.exit(1);
}

if (!htmlContent.includes('VoiceText')) {
  console.error('FAIL: dist/index.html missing VoiceText branding title.');
  process.exit(1);
}

const assetsDir = path.join(distDir, 'assets');
if (!fs.existsSync(assetsDir)) {
  console.error('FAIL: dist/assets directory missing.');
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const hasJs = files.some(f => f.endsWith('.js'));
const hasCss = files.some(f => f.endsWith('.css'));

if (!hasJs || !hasCss) {
  console.error('FAIL: Missing bundled JS or CSS assets in dist/assets.');
  process.exit(1);
}

console.log('SUCCESS: Frontend smoke test passed! All bundles and HTML verified.');
process.exit(0);
