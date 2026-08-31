use std::{collections::HashMap, time::Duration};

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use futures_util::StreamExt;
use reqwest::StatusCode;
use ring::signature::{UnparsedPublicKey, ED25519};
use semver::Version;
use serde::Deserialize;
use url::Url;

use crate::constants::{
    UPDATE_ALLOWED_HOST, UPDATE_ALLOWED_PATH_PREFIX, UPDATE_MANIFEST_SCHEMA_VERSION,
    UPDATE_MAX_FILE_BYTES, UPDATE_MAX_MANIFEST_BYTES,
};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SignedManifestEnvelope {
    payload: String,
    signature: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct UpdateManifest {
    schema_version: u32,
    version: String,
    published_at: String,
    files: HashMap<String, UpdateFile>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct UpdateFile {
    file: String,
    sha256_hash: String,
    name: String,
    size: u64,
}

#[derive(Debug, Clone)]
pub(super) struct UpdateCandidate {
    pub version: Version,
    pub file_url: String,
    pub file_name: String,
    pub expected_hash: String,
    pub expected_size: u64,
}

pub(super) async fn load_manifest(
    client: &reqwest::Client,
    manifest_url: &str,
) -> Result<Option<UpdateManifest>> {
    let url = validate_update_url(manifest_url, true)?;
    let response = client
        .get(url.clone())
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .with_context(|| format!("Failed to request update manifest: {url}"))?;

    if response.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(anyhow!(
            "Failed to load update manifest: HTTP {}",
            response.status().as_u16()
        ));
    }

    let bytes = read_limited_response(response, UPDATE_MAX_MANIFEST_BYTES).await?;
    decode_manifest(&bytes).map(Some)
}

pub(super) fn latest_version(manifest: &UpdateManifest) -> Result<Version> {
    parse_version(&manifest.version)
}

pub(super) fn select_update_candidate(
    manifest: &UpdateManifest,
    manifest_url: &str,
) -> Result<Option<UpdateCandidate>> {
    validate_manifest(manifest)?;
    let platform_key = current_platform_key();
    let Some(file) = manifest.files.get(&platform_key) else {
        return Ok(None);
    };

    let file_url = absolutize_update_url(&file.file, manifest_url)?;
    let url_file_name = file_name_from_url(&file_url)?;
    if file.name != url_file_name || sanitize_file_name(&file.name) != file.name {
        return Err(anyhow!(
            "Update filename does not match its URL for {platform_key}"
        ));
    }

    Ok(Some(UpdateCandidate {
        version: parse_version(&manifest.version)?,
        file_url,
        file_name: file.name.clone(),
        expected_hash: file.sha256_hash.clone(),
        expected_size: file.size,
    }))
}

pub(super) fn parse_version(value: &str) -> Result<Version> {
    if value.trim() != value || value.starts_with('v') {
        return Err(anyhow!(
            "Version must be a strict SemVer value without a v prefix"
        ));
    }
    Version::parse(value).with_context(|| format!("Invalid SemVer version: {value}"))
}

pub(super) fn current_platform_key() -> String {
    let os = std::env::consts::OS;
    format!("{os}-{}", std::env::consts::ARCH)
}

pub(super) fn automatic_install_supported() -> bool {
    cfg!(target_os = "windows")
}

fn decode_manifest(bytes: &[u8]) -> Result<UpdateManifest> {
    let envelope: SignedManifestEnvelope =
        serde_json::from_slice(bytes).context("Update manifest envelope is not valid JSON")?;
    let payload = BASE64_STANDARD
        .decode(envelope.payload.trim())
        .context("Update manifest payload is not valid base64")?;
    if payload.len() > UPDATE_MAX_MANIFEST_BYTES as usize {
        return Err(anyhow!("Update manifest payload is too large"));
    }
    let signature = BASE64_STANDARD
        .decode(envelope.signature.trim())
        .context("Update manifest signature is not valid base64")?;
    let public_key = embedded_public_key()?;
    verify_signature(&payload, &signature, &public_key)?;

    let manifest: UpdateManifest = serde_json::from_slice(&payload)
        .context("Signed update manifest payload is not valid JSON")?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn embedded_public_key() -> Result<Vec<u8>> {
    let value = option_env!("WINKY_UPDATE_PUBLIC_KEY")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("Update public key is not embedded in this build"))?;
    let public_key = BASE64_STANDARD
        .decode(value)
        .context("Embedded update public key is not valid base64")?;
    if public_key.len() != 32 {
        return Err(anyhow!("Embedded update public key must contain 32 bytes"));
    }
    Ok(public_key)
}

fn verify_signature(payload: &[u8], signature: &[u8], public_key: &[u8]) -> Result<()> {
    if signature.len() != 64 {
        return Err(anyhow!("Update manifest signature must contain 64 bytes"));
    }
    UnparsedPublicKey::new(&ED25519, public_key)
        .verify(payload, signature)
        .map_err(|_| anyhow!("Update manifest signature is invalid"))
}

fn validate_manifest(manifest: &UpdateManifest) -> Result<()> {
    if manifest.schema_version != UPDATE_MANIFEST_SCHEMA_VERSION {
        return Err(anyhow!(
            "Unsupported update manifest schema: {}",
            manifest.schema_version
        ));
    }
    parse_version(&manifest.version)?;
    chrono::DateTime::parse_from_rfc3339(&manifest.published_at)
        .context("Update manifest publishedAt must be RFC 3339")?;
    if manifest.files.is_empty() {
        return Err(anyhow!("Update manifest does not contain platform files"));
    }

    for (platform, file) in &manifest.files {
        validate_platform_key(platform)?;
        validate_hash(&file.sha256_hash, platform)?;
        if file.size == 0 || file.size > UPDATE_MAX_FILE_BYTES {
            return Err(anyhow!("Invalid update size for {platform}"));
        }
        if file.name.is_empty() || sanitize_file_name(&file.name) != file.name {
            return Err(anyhow!("Invalid update filename for {platform}"));
        }
        validate_update_url(&file.file, false)?;
    }
    Ok(())
}

fn validate_platform_key(value: &str) -> Result<()> {
    let Some((os, arch)) = value.split_once('-') else {
        return Err(anyhow!("Invalid update platform key: {value}"));
    };
    if !matches!(os, "windows" | "macos" | "linux") || !matches!(arch, "x86_64" | "aarch64") {
        return Err(anyhow!("Unsupported update platform key: {value}"));
    }
    Ok(())
}

fn validate_hash(value: &str, platform: &str) -> Result<()> {
    if value.len() != 64
        || !value.chars().all(|ch| ch.is_ascii_hexdigit())
        || value.chars().any(|ch| ch.is_ascii_uppercase())
    {
        return Err(anyhow!("Invalid sha256 hash for {platform}"));
    }
    Ok(())
}

fn absolutize_update_url(raw_file: &str, manifest_url: &str) -> Result<String> {
    let manifest = validate_update_url(manifest_url, true)?;
    let file = match Url::parse(raw_file) {
        Ok(url) => url,
        Err(url::ParseError::RelativeUrlWithoutBase) => manifest.join(raw_file)?,
        Err(error) => return Err(error.into()),
    };
    Ok(validate_update_url(file.as_str(), false)?.to_string())
}

fn validate_update_url(value: &str, is_manifest: bool) -> Result<Url> {
    let url = Url::parse(value).with_context(|| format!("Invalid update URL: {value}"))?;
    if url.scheme() != "https" {
        return Err(anyhow!("Update URLs must use HTTPS"));
    }
    if url.host_str() != Some(UPDATE_ALLOWED_HOST)
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(anyhow!("Update URL origin is not allowed"));
    }
    if !url.path().starts_with(UPDATE_ALLOWED_PATH_PREFIX)
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(anyhow!("Update URL path is not allowed"));
    }
    if is_manifest && !url.path().ends_with(".json") {
        return Err(anyhow!("Update manifest URL must point to a JSON file"));
    }
    Ok(url)
}

fn file_name_from_url(file_url: &str) -> Result<String> {
    let encoded = Url::parse(file_url)?
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| anyhow!("Update URL does not contain a filename"))?;
    Ok(urlencoding::decode(&encoded)
        .context("Update URL filename is not valid UTF-8")?
        .into_owned())
}

fn sanitize_file_name(value: &str) -> String {
    value
        .chars()
        .filter(|ch| {
            *ch != '/'
                && *ch != '\\'
                && *ch != ':'
                && *ch != '*'
                && *ch != '?'
                && *ch != '"'
                && *ch != '<'
                && *ch != '>'
                && *ch != '|'
                && !ch.is_control()
        })
        .collect::<String>()
        .trim()
        .to_string()
}

async fn read_limited_response(response: reqwest::Response, limit: u64) -> Result<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > limit)
    {
        return Err(anyhow!("Update response exceeds the allowed size"));
    }

    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if bytes.len() as u64 + chunk.len() as u64 > limit {
            return Err(anyhow!("Update response exceeds the allowed size"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub(super) fn build_manifest_http_client(
    request_timeout: Duration,
    connect_timeout: Duration,
) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(request_timeout)
        .connect_timeout(connect_timeout)
        .redirect(reqwest::redirect::Policy::none())
        .https_only(true)
        .build()
        .context("Failed to create update manifest HTTP client")
}

pub(super) fn build_download_http_client(
    connect_timeout: Duration,
    read_timeout: Duration,
) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(connect_timeout)
        .read_timeout(read_timeout)
        .redirect(reqwest::redirect::Policy::none())
        .https_only(true)
        .build()
        .context("Failed to create update download HTTP client")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_rfc_8032_signature_vector() {
        let public_key = BASE64_STANDARD
            .decode("11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=")
            .unwrap();
        let signature = BASE64_STANDARD
            .decode(
                "5VZDAMNgrHKQhuLMgG6CioSHfx645dl02HPgZSJJAVVfuIIVkKM7rMYeOXAc+bRr0lv18FlbviRlUUFDjnoQCw==",
            )
            .unwrap();

        verify_signature(b"", &signature, &public_key).unwrap();
        assert!(verify_signature(b"changed", &signature, &public_key).is_err());
    }

    #[test]
    fn compares_semver_prereleases_strictly() {
        let release = parse_version("2.0.0").unwrap();
        let prerelease = parse_version("2.0.0-rc.1").unwrap();

        assert!(release > prerelease);
        assert!(parse_version("v2.0.0").is_err());
        assert!(parse_version("2.0").is_err());
        assert!(parse_version("garbage").is_err());
    }

    #[test]
    fn rejects_insecure_and_foreign_urls() {
        assert!(validate_update_url("http://s3.twcstorage.ru/file", false).is_err());
        assert!(validate_update_url("https://example.com/file", false).is_err());
        assert!(validate_update_url(
            "https://s3.twcstorage.ru/324718a4-2cc5dd7a-917b-4e82-87c5-b9d5f8de16ba/winky/v2/file.exe",
            false,
        )
        .is_ok());
    }
}
