use std::path::PathBuf;

use crate::error::AppError;
use crate::models::ProjectRecord;

#[cfg(test)]
thread_local! {
    pub static MOCK_DATA_DIR: std::cell::RefCell<Option<PathBuf>> = std::cell::RefCell::new(None);
}

fn project_store_path() -> Result<PathBuf, AppError> {
    #[cfg(test)]
    let base = {
        let mut mock_dir = None;
        MOCK_DATA_DIR.with(|dir| {
            if let Some(ref d) = *dir.borrow() {
                mock_dir = Some(d.clone());
            }
        });
        mock_dir.unwrap_or_else(|| std::env::temp_dir().join("keystore-forge-test"))
    };

    #[cfg(not(test))]
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct TestEnv {
        dir: PathBuf,
    }

    impl TestEnv {
        fn new() -> Self {
            let id = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("keystore-forge-test-{}", id));
            fs::create_dir_all(&dir).unwrap();

            MOCK_DATA_DIR.with(|d| {
                *d.borrow_mut() = Some(dir.clone());
            });

            TestEnv { dir }
        }
    }

    impl Drop for TestEnv {
        fn drop(&mut self) {
            MOCK_DATA_DIR.with(|d| {
                *d.borrow_mut() = None;
            });
            let _ = fs::remove_dir_all(&self.dir);
        }
    }

    fn create_mock_project(id: &str) -> ProjectRecord {
        ProjectRecord {
            id: id.to_string(),
            name: "Test Project".to_string(),
            project_type: "android".to_string(),
            signing_provider: crate::models::SigningProvider::Local,
            package_name: None,
            project_root: None,
            artifact_path: None,
            output_dir: None,
            keystore_path: None,
            alias: None,
            pkcs11_module: None,
            pkcs11_slot: None,
            created_at: "2023-01-01T00:00:00Z".to_string(),
            updated_at: "2023-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_upsert_project_new() {
        let _env = TestEnv::new();

        let p1 = create_mock_project("proj-1");

        // Assert store is initially empty
        let projects = load_projects().unwrap();
        assert_eq!(projects.len(), 0);

        // Upsert a new project
        let result = upsert_project(p1.clone()).unwrap();
        assert_eq!(result.id, "proj-1");

        // Verify it was saved
        let projects = load_projects().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, "proj-1");
        assert_eq!(projects[0].name, "Test Project");
    }

    #[test]
    fn test_upsert_project_update() {
        let _env = TestEnv::new();

        let p1 = create_mock_project("proj-2");
        upsert_project(p1).unwrap();

        // Load and update the project
        let mut p1_updated = create_mock_project("proj-2");
        p1_updated.name = "Updated Project Name".to_string();

        // Upsert should update, not duplicate
        upsert_project(p1_updated).unwrap();

        let projects = load_projects().unwrap();
        assert_eq!(projects.len(), 1, "Project should be updated, not duplicated");
        assert_eq!(projects[0].id, "proj-2");
        assert_eq!(projects[0].name, "Updated Project Name");
    }
}
