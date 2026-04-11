use std::path::PathBuf;

use crate::error::AppError;
use crate::models::ProjectRecord;

fn project_store_path() -> Result<PathBuf, AppError> {
    let base = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("could not resolve local data directory".into()))?
        .join("keystore-forge");
    std::fs::create_dir_all(&base)?;
    Ok(base.join("projects.json"))
}

pub fn load_projects() -> Result<Vec<ProjectRecord>, AppError> {
    let path = project_store_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(path)?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&raw)?)
}

pub fn save_projects(projects: &[ProjectRecord]) -> Result<(), AppError> {
    let path = project_store_path()?;
    let payload = serde_json::to_string_pretty(projects)?;
    std::fs::write(path, payload)?;
    Ok(())
}

pub fn upsert_project(project: ProjectRecord) -> Result<ProjectRecord, AppError> {
    let mut projects = load_projects()?;
    if let Some(index) = projects.iter().position(|item| item.id == project.id) {
        projects[index] = project.clone();
    } else {
        projects.push(project.clone());
    }
    save_projects(&projects)?;
    Ok(project)
}

pub fn delete_project(id: &str) -> Result<bool, AppError> {
    let mut projects = load_projects()?;
    let original_len = projects.len();
    projects.retain(|item| item.id != id);
    save_projects(&projects)?;
    Ok(projects.len() != original_len)
}
