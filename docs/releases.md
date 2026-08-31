# Winky releases

Releases are created only from signed Git tags matching `v<package.json version>`. A manual workflow run performs quality checks but cannot publish packages.

## Versioning

`package.json` is the version source. The npm version hook synchronizes `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the Winky package entry in `src-tauri/Cargo.lock` without running Cargo.

```bash
npm version patch
git push origin main --follow-tags
```

Use `minor` or `major` instead of `patch` when appropriate. Do not create a release tag manually: CI rejects a tag that differs from the package version and rejects a version that is not newer than the published manifest.

## Required release secrets

Configure these secrets in the protected `release` GitHub environment:

| Secret | Purpose |
| --- | --- |
| `S3_ACCESS_KEY_ID` | Access to the release bucket |
| `S3_SECRET_ACCESS_KEY` | Access to the release bucket |
| `WINKY_UPDATE_SIGNING_KEY` | Base64 PKCS#8 DER Ed25519 private key used only by the manifest job |
| `WINKY_UPDATE_PUBLIC_KEY` | Base64 raw 32-byte Ed25519 public key embedded in every release binary |
| `WINDOWS_CERTIFICATE` | Base64 PFX used to sign Windows installers |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the Windows PFX |

Create the update signing key once on a trusted offline machine. Keep the private file outside the repository and back it up securely.

```bash
openssl genpkey -algorithm ED25519 -outform DER -out winky-update-private.der
openssl pkey -in winky-update-private.der -inform DER -pubout -outform DER -out winky-update-public.der
base64 < winky-update-private.der
tail -c 32 winky-update-public.der | base64
```

The first Base64 value is `WINKY_UPDATE_SIGNING_KEY`; the second is `WINKY_UPDATE_PUBLIC_KEY`. CI verifies that the pair matches before publishing.

## Pipeline guarantees

Every pull request and push to `main` runs TypeScript checks, version checks, Rust formatting, `cargo check`, Clippy, and Rust tests. A tag additionally builds the Windows x86_64 package and checks every published EXE/MSI with `Get-AuthenticodeSignature`. The signature must be `Valid`, and its leaf-certificate thumbprint must match the certificate imported from `WINDOWS_CERTIFICATE` for that build.

The release job creates a compact manifest payload with the tagged commit timestamp, signs its exact bytes with Ed25519, and publishes a signed envelope. Using the commit timestamp makes the manifest and signature reproducible when the same tagged workflow is rerun. Artifact URLs, sizes, and SHA-256 values are inside the signed payload. HTTPS origin and bucket path are also restricted by the client.

Every versioned S3 object is created with conditional `If-None-Match: *`: installers, `manifest.json`, `manifest.sig`, and the versioned `latest.json` envelope. If an object already exists, CI downloads it and accepts it only when its size, SHA-256, and exact bytes match the current release. A `HEAD` failure other than an actual 404 stops publication; a mismatching object is never overwritten.

Release reruns are resumable. CI reuses matching S3 objects and an existing GitHub Release, verifies each existing GitHub asset byte for byte, uploads only missing assets, and continues the smoke checks. The mutable root `latest.json` pointer is written with an ETag/absence precondition only after the versioned public files, signature, advertised installers, and GitHub assets pass verification. This allows a rerun to recover the pointer after a partially completed publication without weakening version immutability or overwriting a concurrently published pointer.

When only the publication job failed, use **Re-run failed jobs** so GitHub reuses the original signed package artifact. A full rebuild of the same tag can produce different timestamped Authenticode bytes; CI intentionally rejects those bytes instead of mutating the existing version. Publish changed bytes under a new version and tag.

Official releases currently target Windows x86_64 only. On Windows, persistent authentication tokens and provider keys are protected with DPAPI. macOS and Linux release packaging remains disabled until an OS-protected persistent secret store is implemented for each platform.
