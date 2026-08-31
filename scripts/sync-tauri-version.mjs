import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');
const packagePath = path.join(root, 'package.json');
const tauriConfigPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(root, 'src-tauri', 'Cargo.toml');
const cargoLockPath = path.join(root, 'src-tauri', 'Cargo.lock');
const checkOnly = process.argv.includes('--check');
const tagIndex = process.argv.indexOf('--tag');
const expectedTag = tagIndex >= 0 ? process.argv[tagIndex + 1] : null;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const version = packageJson.version;
if (!semverPattern.test(version)) {
    throw new Error(`package.json contains an invalid SemVer version: ${version}`);
}
if (expectedTag !== null && expectedTag !== `v${version}`) {
    throw new Error(`Release tag ${expectedTag} does not match package version v${version}`);
}

const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
const cargoLock = fs.readFileSync(cargoLockPath, 'utf8');
const cargoTomlPattern = /^(version\s*=\s*")([^"]+)(")/m;
const cargoLockPattern = /(\[\[package\]\]\r?\nname = "winky"\r?\nversion = ")([^"]+)(")/;
const cargoTomlMatch = cargoToml.match(cargoTomlPattern);
const cargoLockMatch = cargoLock.match(cargoLockPattern);
const mismatches = [];

if (tauriConfig.version !== version) mismatches.push(`tauri.conf.json=${tauriConfig.version}`);
if (cargoTomlMatch?.[2] !== version) mismatches.push(`Cargo.toml=${cargoTomlMatch?.[2] ?? 'missing'}`);
if (cargoLockMatch?.[2] !== version) mismatches.push(`Cargo.lock=${cargoLockMatch?.[2] ?? 'missing'}`);

if (checkOnly) {
    if (mismatches.length > 0) {
        throw new Error(`Version mismatch: package.json=${version}; ${mismatches.join('; ')}`);
    }
    console.log(`[sync-tauri-version] Version ${version} is consistent.`);
    process.exit(0);
}

if (mismatches.length === 0) {
    console.log(`[sync-tauri-version] Version ${version} is already consistent.`);
    process.exit(0);
}
if (!cargoTomlMatch || !cargoLockMatch) {
    throw new Error('Could not locate the Winky package version in Cargo files.');
}

tauriConfig.version = version;
const nextCargoToml = cargoToml.replace(cargoTomlPattern, `$1${version}$3`);
const nextCargoLock = cargoLock.replace(cargoLockPattern, `$1${version}$3`);
fs.writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, 'utf8');
fs.writeFileSync(cargoTomlPath, nextCargoToml, 'utf8');
fs.writeFileSync(cargoLockPath, nextCargoLock, 'utf8');
console.log(`[sync-tauri-version] Synchronized Tauri and Cargo to ${version}.`);
