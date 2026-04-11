use keyring::Entry;

use crate::error::AppError;
use crate::models::{KeystoreCreateInput, KeystoreInfo, ProjectRecord, SecretRef, SecretStoreInput, SigningInput, VerificationResult, CommandResult, PasswordRotationInput, CertificateExportInput, DiscoveredArtifact};
use crate::project_store;
use crate::signing;
use crate::tools;

#[tauri::command]
pub fn discover_artifacts(project_root: String) -> Vec<DiscoveredArtifact> {
    tools::discover_artifacts(&project_root)
}

#[tauri::command]
pub fn rotate_keystore_password(input: PasswordRotationInput) -> Result<CommandResult, AppError> {
    signing::rotate_keystore_password(input)
}

#[tauri::command]
pub fn export_certificate(input: CertificateExportInput) -> Result<CommandResult, AppError> {
    signing::export_certificate(input)
}

#[tauri::command]
pub fn healthcheck() -> &'static str {
    "Keystore Forge ready"
}

#[tauri::command]
pub fn create_keystore(input: KeystoreCreateInput) -> Result<KeystoreInfo, AppError> {
    signing::create_keystore(input)
}

#[tauri::command]
pub fn inspect_keystore(path: String, alias: String, store_password: String) -> Result<KeystoreInfo, AppError> {
    signing::inspect_keystore(&path, &alias, &store_password)
}

#[tauri::command]
pub fn sign_apk(input: SigningInput) -> Result<CommandResult, AppError> {
    signing::sign_apk(input)
}

#[tauri::command]
pub fn verify_apk(path: String) -> Result<VerificationResult, AppError> {
    signing::verify_apk(&path)
}

#[tauri::command]
pub fn sign_jar_or_bundle(input: SigningInput) -> Result<CommandResult, AppError> {
    signing::sign_jar_or_bundle(input)
}

#[tauri::command]
pub fn save_secret(input: SecretStoreInput) -> Result<bool, AppError> {
    let entry = Entry::new(&input.secret_ref.service, &input.secret_ref.username)
        .map_err(|error| AppError::SecretStore(error.to_string()))?;
    entry
        .set_password(&input.password)
        .map_err(|error| AppError::SecretStore(error.to_string()))?;
    Ok(true)
}

#[tauri::command]
pub fn load_secret(secret_ref: SecretRef) -> Result<String, AppError> {
    let entry = Entry::new(&secret_ref.service, &secret_ref.username)
        .map_err(|error| AppError::SecretStore(error.to_string()))?;
    entry
        .get_password()
        .map_err(|error| AppError::SecretStore(error.to_string()))
}

#[tauri::command]
pub fn delete_secret(secret_ref: SecretRef) -> Result<bool, AppError> {
    let entry = Entry::new(&secret_ref.service, &secret_ref.username)
        .map_err(|error| AppError::SecretStore(error.to_string()))?;
    entry
        .delete_credential()
        .map_err(|error| AppError::SecretStore(error.to_string()))?;
    Ok(true)
}

#[tauri::command]
pub fn list_projects() -> Result<Vec<ProjectRecord>, AppError> {
    project_store::load_projects()
}

#[tauri::command]
pub fn upsert_project(project: ProjectRecord) -> Result<ProjectRecord, AppError> {
    project_store::upsert_project(project)
}

#[tauri::command]
pub fn delete_project(id: String) -> Result<bool, AppError> {
    project_store::delete_project(&id)
}
