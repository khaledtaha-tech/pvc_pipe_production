import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const distDir = path.join(projectRoot, 'dist');
const distAssets = path.join(distDir, 'assets');

if (!fs.existsSync(distDir)) {
  console.error('❌ dist directory not found! Run vite build first.');
  process.exit(1);
}

// 1. Ensure dist/index.html exists from build
const distDevHtml = path.join(distDir, 'index.dev.html');
const distIndexHtml = path.join(distDir, 'index.html');
if (fs.existsSync(distDevHtml) && !fs.existsSync(distIndexHtml)) {
  fs.copyFileSync(distDevHtml, distIndexHtml);
}

// 2. Synchronize to Project Root
if (fs.existsSync(distIndexHtml)) {
  fs.copyFileSync(distIndexHtml, path.join(projectRoot, 'index.html'));
  console.log('✅ Synchronized root index.html with production build');
}

const rootAssets = path.join(projectRoot, 'assets');
if (fs.existsSync(rootAssets)) {
  fs.rmSync(rootAssets, { recursive: true, force: true });
}
if (fs.existsSync(distAssets)) {
  fs.cpSync(distAssets, rootAssets, { recursive: true, force: true });
  console.log('✅ Synchronized root assets/ directory');
}

// 3. Synchronize to public_html (Hostinger docroot layout)
const publicHtmlDir = path.join(projectRoot, 'public_html');
if (!fs.existsSync(publicHtmlDir)) {
  fs.mkdirSync(publicHtmlDir, { recursive: true });
}
if (fs.existsSync(distIndexHtml)) {
  fs.copyFileSync(distIndexHtml, path.join(publicHtmlDir, 'index.html'));
}
const publicHtmlAssets = path.join(publicHtmlDir, 'assets');
if (fs.existsSync(publicHtmlAssets)) {
  fs.rmSync(publicHtmlAssets, { recursive: true, force: true });
}
if (fs.existsSync(distAssets)) {
  fs.cpSync(distAssets, publicHtmlAssets, { recursive: true, force: true });
  console.log('✅ Synchronized public_html/ assets and index.html');
}

// 4. Synchronize api/ backend into dist/api and public_html/api preserving live config.php
function copyApiDirPreservingConfig(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyApiDirPreservingConfig(srcPath, destPath);
    } else {
      if (entry.name === 'config.php') {
        // Do NOT overwrite config.php if destination already exists
        if (fs.existsSync(destPath)) {
          console.log(`🔒 Preserved existing ${path.relative(projectRoot, destPath)} (database credentials protected)`);
          continue;
        }

        // If destination does not exist yet, check if live credentials exist in public_html/api/config.php
        const liveConfigPath = path.join(publicHtmlDir, 'api', 'config.php');
        if (destPath !== liveConfigPath && fs.existsSync(liveConfigPath)) {
          const liveContent = fs.readFileSync(liveConfigPath, 'utf8');
          if (!liveContent.includes('DB_PASSWORD_HERE')) {
            fs.copyFileSync(liveConfigPath, destPath);
            console.log(`🔒 Propagated live credentials from public_html to ${path.relative(projectRoot, destPath)}`);
            continue;
          }
        }
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const sourceApiDir = path.join(projectRoot, 'api');
if (fs.existsSync(sourceApiDir)) {
  const distApi = path.join(distDir, 'api');
  const pubApi = path.join(publicHtmlDir, 'api');
  copyApiDirPreservingConfig(sourceApiDir, distApi);
  copyApiDirPreservingConfig(sourceApiDir, pubApi);
  console.log('✅ Synchronized api/ backend into dist/api and public_html/api (live config preserved)');
}

// 5. Ensure Apache / LiteSpeed .htaccess for Single Page Applications
const htaccessContent = `<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

<IfModule mod_mime.c>
  AddType application/javascript .js .mjs
  AddType text/css .css
</IfModule>
`;

fs.writeFileSync(path.join(projectRoot, '.htaccess'), htaccessContent);
fs.writeFileSync(path.join(distDir, '.htaccess'), htaccessContent);
fs.writeFileSync(path.join(publicHtmlDir, '.htaccess'), htaccessContent);
console.log('✅ Created .htaccess in root, dist, and public_html');

// 6. Synchronize public static assets (favicon, master excel files)
const publicDir = path.join(projectRoot, 'public');
if (fs.existsSync(publicDir)) {
  const files = fs.readdirSync(publicDir);
  for (const file of files) {
    if (file.startsWith('~$') || file === '.htaccess') continue;
    const srcFile = path.join(publicDir, file);
    if (fs.statSync(srcFile).isFile()) {
      fs.copyFileSync(srcFile, path.join(projectRoot, file));
      fs.copyFileSync(srcFile, path.join(distDir, file));
      fs.copyFileSync(srcFile, path.join(publicHtmlDir, file));
    }
  }
  console.log('✅ Synchronized public Excel and icon assets');
}

console.log('🎉 Production bundle fully synchronized for Hostinger auto-deploy!');
