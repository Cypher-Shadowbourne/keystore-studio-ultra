use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SigningProvider {
    Local,
    Pkcs11,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub project_type: String,
    pub signing_provider: SigningProvider,
    pub package_name: Option<String>,
    pub project_root: Option<String>,
    pub artifact_path: Option<String>,
    pub output_dir: Option<String>,
    pub keystore_path: Option<String>,
    pub alias: Option<String>,
    pub pkcs11_module: Option<String>,
    pub pkcs11_slot: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeystoreCreateInput {
    pub path: String,
    pub alias: String,
    pub dname: String,
    pub validity_days: u32,
    pub key_algorithm: String,
    pub key_size: u32,
    pub store_password: String,
    pub key_password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeystoreInfo {
    pub path: String,
    pub alias: String,
    pub owner: Option<String>,
    pub issuer: Option<String>,
    pub valid_from: Option<String>,
    pub valid_until: Option<String>,
    pub sha1: Option<String>,
    pub sha256: Option<String>,
    pub store_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningInput {
    pub artifact_path: String,
    pub output_path: Option<String>,
    pub keystore_path: Option<String>,
    pub alias: String,
    pub store_password: String,
    pub key_password: Option<String>,
    pub min_sdk_version: Option<u32>,
    pub provider: SigningProvider,
    pub pkcs11_module: Option<String>,
    pub pkcs11_slot: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub success: bool,
    pub command: Vec<String>,
    pub stdout: String,
    pub stderr: String,
    pub output_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationResult {
    pub verified: bool,
    pub stdout: String,
    pub stderr: String,
    pub signer_cert_sha1: Option<String>,
    pub signer_cert_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretRef {
    pub service: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretStoreInput {
    pub secret_ref: SecretRef,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredArtifact {
    pub path: String,
    pub name: String,
    pub artifact_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordRotationInput {
    pub keystore_path: String,
    pub alias: String,
    pub old_password: String,
    pub new_password: String,
    pub is_key_password: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateExportInput {
    pub keystore_path: String,
    pub alias: String,
    pub store_password: String,
    pub output_path: String,
}
