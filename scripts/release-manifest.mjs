import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {Readable} from 'stream';

class ReleaseManifest {
    static semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

    static requiredPlatforms = new Set([
        'windows-x86_64',
    ]);

    static run(args) {
        const [command, ...values] = args;
        if (command === 'create-payload') return this.createPayload(...values);
        if (command === 'create-envelope') return this.createEnvelope(...values);
        if (command === 'create-legacy') return this.createLegacy(...values);
        if (command === 'check-monotonic') return this.checkMonotonic(...values);
        if (command === 'extract-envelope') return this.extractEnvelope(...values);
        if (command === 'list-artifacts') return this.listArtifacts(...values);
        if (command === 'verify-artifacts') return this.verifyArtifacts(...values);
        throw new Error(`Unknown release manifest command: ${command ?? 'missing'}`);
    }

    static createPayload(metadataDir, tag, baseUrl, outputPath, publishedAt) {
        if (!tag?.startsWith('v')) throw new Error('Release tag must start with v.');
        const version = tag.slice(1);
        this.parseSemver(version);
        const normalizedBaseUrl = new URL(baseUrl);
        if (normalizedBaseUrl.protocol !== 'https:') throw new Error('Release base URL must use HTTPS.');
        if (typeof publishedAt !== 'string' || Number.isNaN(Date.parse(publishedAt))) {
            throw new Error('Release publication timestamp must be a valid ISO date.');
        }

        const files = {};
        for (const entry of fs.readdirSync(metadataDir, {withFileTypes: true})) {
            if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
            const metadata = JSON.parse(fs.readFileSync(path.join(metadataDir, entry.name), 'utf8'));
            this.validateMetadata(metadata);
            if (files[metadata.platform]) throw new Error(`Duplicate platform: ${metadata.platform}`);
            files[metadata.platform] = {
                file: `${baseUrl.replace(/\/$/, '')}/${tag}/${metadata.platform}/${metadata.filename}`,
                name: metadata.filename,
                sha256Hash: metadata.sha256,
                size: metadata.size,
            };
        }

        const missing = [...this.requiredPlatforms].filter(platform => !files[platform]);
        if (missing.length > 0) throw new Error(`Missing release platforms: ${missing.join(', ')}`);
        const sortedFiles = Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)));
        const payload = {
            schemaVersion: 1,
            version,
            publishedAt,
            files: sortedFiles,
        };
        fs.writeFileSync(outputPath, `${JSON.stringify(payload)}\n`, 'utf8');
    }

    static createEnvelope(payloadPath, signaturePath, outputPath) {
        const payload = fs.readFileSync(payloadPath);
        const signature = fs.readFileSync(signaturePath);
        if (signature.length !== 64) throw new Error(`Ed25519 signature must contain 64 bytes, got ${signature.length}.`);
        const envelope = {
            payload: payload.toString('base64'),
            signature: signature.toString('base64'),
        };
        fs.writeFileSync(outputPath, `${JSON.stringify(envelope)}\n`, 'utf8');
    }

    static createLegacy(payloadPath, outputPath) {
        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
        this.parseSemver(payload.version);
        const source = payload.files?.['windows-x86_64'];
        if (!source) throw new Error('Signed payload does not contain windows-x86_64.');
        if (typeof source.file !== 'string' || new URL(source.file).protocol !== 'https:') {
            throw new Error('Legacy Windows artifact URL must use HTTPS.');
        }
        if (typeof source.name !== 'string'
            || source.name.length === 0
            || /[\\/:*?"<>|\u0000-\u001f]/.test(source.name)) {
            throw new Error('Legacy Windows artifact name is invalid.');
        }
        if (!/^[a-f0-9]{64}$/.test(source.sha256Hash)) {
            throw new Error('Legacy Windows artifact sha256 is invalid.');
        }

        const legacy = {
            version: payload.version,
            files: {
                windows: {
                    file: source.file,
                    sha256_hash: source.sha256Hash,
                    name: source.name,
                },
            },
        };
        fs.writeFileSync(outputPath, `${JSON.stringify(legacy)}\n`, 'utf8');
    }

    static checkMonotonic(existingPath, nextPayloadPath, expectedDocumentPath) {
        const existingDocument = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
        const existingPayloadBytes = typeof existingDocument.payload === 'string'
            ? Buffer.from(existingDocument.payload, 'base64')
            : Buffer.from(`${JSON.stringify(existingDocument)}\n`);
        const existingPayload = JSON.parse(existingPayloadBytes.toString('utf8'));
        const nextPayloadBytes = fs.readFileSync(nextPayloadPath);
        const nextPayload = JSON.parse(nextPayloadBytes.toString('utf8'));
        const comparison = this.compareSemver(nextPayload.version, existingPayload.version);
        if (comparison < 0) {
            throw new Error(`Release ${nextPayload.version} must be newer than published ${existingPayload.version}.`);
        }
        if (comparison === 0 && !existingPayloadBytes.equals(nextPayloadBytes)) {
            throw new Error(`Published release ${nextPayload.version} has different immutable manifest bytes.`);
        }
        if (comparison === 0 && expectedDocumentPath
            && !fs.readFileSync(existingPath).equals(fs.readFileSync(expectedDocumentPath))) {
            throw new Error(`Published release ${nextPayload.version} has different current manifest bytes.`);
        }
    }

    static extractEnvelope(envelopePath, payloadPath, signaturePath) {
        const envelope = JSON.parse(fs.readFileSync(envelopePath, 'utf8'));
        if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') {
            throw new Error('Published update manifest is not a signed envelope.');
        }
        fs.writeFileSync(payloadPath, Buffer.from(envelope.payload, 'base64'));
        fs.writeFileSync(signaturePath, Buffer.from(envelope.signature, 'base64'));
    }

    static listArtifacts(payloadPath) {
        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
        for (const [platform, file] of Object.entries(payload.files)) {
            process.stdout.write(`${platform}\t${file.name}\t${file.sha256Hash}\t${file.size}\t${file.file}\n`);
        }
    }

    static async verifyArtifacts(payloadPath) {
        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
        for (const [platform, file] of Object.entries(payload.files)) {
            const response = await fetch(file.file, {redirect: 'error'});
            if (!response.ok || !response.body) {
                throw new Error(`Artifact ${platform} returned HTTP ${response.status}.`);
            }
            const contentLength = Number(response.headers.get('content-length'));
            if (Number.isFinite(contentLength) && contentLength !== file.size) {
                throw new Error(`Artifact ${platform} has an unexpected Content-Length.`);
            }

            const hash = crypto.createHash('sha256');
            let size = 0;
            for await (const chunk of Readable.fromWeb(response.body)) {
                hash.update(chunk);
                size += chunk.length;
            }
            if (size !== file.size || hash.digest('hex') !== file.sha256Hash) {
                throw new Error(`Artifact ${platform} failed its size or hash smoke check.`);
            }
        }
    }

    static validateMetadata(metadata) {
        if (!this.requiredPlatforms.has(metadata.platform)) throw new Error(`Unknown platform: ${metadata.platform}`);
        if (typeof metadata.filename !== 'string'
            || metadata.filename.length === 0
            || /[\\/:*?"<>|\u0000-\u001f]/.test(metadata.filename)) {
            throw new Error(`Invalid filename for ${metadata.platform}.`);
        }
        if (!/^[a-f0-9]{64}$/.test(metadata.sha256)) throw new Error(`Invalid sha256 for ${metadata.platform}.`);
        if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0) throw new Error(`Invalid size for ${metadata.platform}.`);
    }

    static parseSemver(value) {
        const match = this.semverPattern.exec(value);
        if (!match) throw new Error(`Invalid SemVer value: ${value}`);
        return {
            core: [Number(match[1]), Number(match[2]), Number(match[3])],
            prerelease: match[4]?.split('.') ?? [],
        };
    }

    static compareSemver(leftValue, rightValue) {
        const left = this.parseSemver(leftValue);
        const right = this.parseSemver(rightValue);
        for (let index = 0; index < left.core.length; index += 1) {
            if (left.core[index] !== right.core[index]) return left.core[index] > right.core[index] ? 1 : -1;
        }
        if (left.prerelease.length === 0 || right.prerelease.length === 0) {
            if (left.prerelease.length === right.prerelease.length) return 0;
            return left.prerelease.length === 0 ? 1 : -1;
        }
        const length = Math.max(left.prerelease.length, right.prerelease.length);
        for (let index = 0; index < length; index += 1) {
            const leftPart = left.prerelease[index];
            const rightPart = right.prerelease[index];
            if (leftPart === undefined || rightPart === undefined) return leftPart === undefined ? -1 : 1;
            if (leftPart === rightPart) continue;
            const leftNumeric = /^\d+$/.test(leftPart);
            const rightNumeric = /^\d+$/.test(rightPart);
            if (leftNumeric && rightNumeric) return Number(leftPart) > Number(rightPart) ? 1 : -1;
            if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
            return leftPart > rightPart ? 1 : -1;
        }
        return 0;
    }
}

await ReleaseManifest.run(process.argv.slice(2));
