import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const tauriConfigPath = path.join(root, 'src-tauri', 'tauri.conf.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));

if (tauriConfig.version !== pkg.version) {
    tauriConfig.version = pkg.version;
    fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2) + '\n');
    console.log(`[sync-tauri-version] Updated tauri.conf.json version -> ${pkg.version}`);
} else {
    console.log('[sync-tauri-version] Tauri config version already up to date.');
}
