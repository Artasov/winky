# Winky releases

Releases are created only from Git tags matching `v<package.json version>`. A manual workflow run performs quality checks but cannot publish packages.

## Versioning

`package.json` is the version source. The npm version hook synchronizes `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the Winky package entry in `src-tauri/Cargo.lock` without running Cargo.

```bash
npm version patch
git push origin main --follow-tags
```

Use `minor` or `major` instead of `patch` when appropriate. Do not create a release tag manually: CI rejects a tag that differs from the package version and rejects a version that is not newer than the published manifest.

## Release secrets

Configure the required secrets at repository level or in the protected `release` GitHub environment:

| Secret | Requirement | Purpose |
| --- | --- | --- |
| `S3_ACCESS_KEY_ID` | Required | Access to the release bucket |
| `S3_SECRET_ACCESS_KEY` | Required | Access to the release bucket |
| `WINKY_UPDATE_SIGNING_KEY` | Required | Base64 PKCS#8 DER Ed25519 private key used only by the manifest job |
| `WINKY_UPDATE_PUBLIC_KEY` | Required | Base64 raw 32-byte Ed25519 public key embedded in every release binary |

Create the update signing key once on a trusted offline machine. Keep the private file outside the repository and back it up securely.

```bash
openssl genpkey -algorithm ED25519 -outform DER -out winky-update-private.der
openssl pkey -in winky-update-private.der -inform DER -pubout -outform DER -out winky-update-public.der
base64 < winky-update-private.der
tail -c 32 winky-update-public.der | base64
```

The first Base64 value is `WINKY_UPDATE_SIGNING_KEY`; the second is `WINKY_UPDATE_PUBLIC_KEY`. CI verifies that the pair matches before publishing. Ed25519 manifest signing is mandatory. Windows installers are intentionally published unsigned.

## Pipeline guarantees

Every pull request and push to `main` runs TypeScript checks, version checks, Rust formatting, `cargo check`, Clippy, and Rust tests. A tag additionally builds the unsigned Windows x86_64 package.

The release job creates a compact manifest payload with the tagged commit timestamp, signs its exact bytes with Ed25519, and publishes a signed envelope. Using the commit timestamp makes the manifest and signature reproducible when the same tagged workflow is rerun. Artifact URLs, sizes, and SHA-256 values are inside the signed payload. HTTPS origin and bucket path are also restricted by the client. Current clients read the mutable signed envelope from `latest-v2.json`.

For Windows clients up to 1.4.4, CI derives a legacy `latest.json` from the same signed payload. It maps `windows-x86_64` to the old `windows` key without changing the artifact URL or SHA-256, and publishes this compatibility pointer only after the signed v2 pointer is ready. Existing Windows installations can therefore move to the signed-manifest client without trusting separately maintained release metadata.

Every versioned S3 object is created with conditional `If-None-Match: *`: installers, `manifest.json`, `manifest.sig`, and the versioned `latest.json` envelope. If an object already exists, CI downloads it and accepts it only when its size, SHA-256, and exact bytes match the current release. A `HEAD` failure other than an actual 404 stops publication; a mismatching object is never overwritten.

Release reruns are resumable. CI reuses matching S3 objects and updates the GitHub Release body with direct S3 links to the installers. GitHub Release assets are intentionally forbidden; the automatic source archives shown by GitHub are generated from the tag and cannot be disabled for an existing Release. The mutable signed `latest-v2.json` and legacy `latest.json` pointers are written in that order only after the versioned public files, signature, and advertised installers pass verification. This allows a rerun to recover either pointer after a partially completed publication without weakening version immutability.

When only the publication job failed, use **Re-run failed jobs** so GitHub reuses the original package artifact. CI intentionally rejects changed bytes instead of mutating an existing version. Publish changed bytes under a new version and tag.

Official releases currently target Windows x86_64 only. The legacy bridge therefore does not add a newer package for existing macOS or Linux installations. On Windows, persistent authentication tokens and provider keys are protected with DPAPI. macOS and Linux release packaging remains disabled until an OS-protected persistent secret store is implemented for each platform.
