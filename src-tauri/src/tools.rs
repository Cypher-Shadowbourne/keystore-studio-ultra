use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::AppError;

pub fn ensure_parent_dir(path: &Path) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}

pub fn output_path_for_signed_artifact(input_path: &Path, output_hint: Option<&str>) -> Result<PathBuf, AppError> {
    if let Some(hint) = output_hint {
        let hinted = PathBuf::from(hint);
        if hinted.extension().is_some() {
            ensure_parent_dir(&hinted)?;
            return Ok(hinted);
        }

        std::fs::create_dir_all(&hinted)?;
        let stem = input_path
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::InvalidInput("invalid input artifact file name".into()))?;
        let ext = input_path
            .extension()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::InvalidInput("artifact has no extension".into()))?;
        return Ok(hinted.join(format!("{stem}-signed.{ext}")));
    }

    let stem = input_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::InvalidInput("invalid input artifact file name".into()))?;
    let ext = input_path
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::InvalidInput("artifact has no extension".into()))?;
    Ok(input_path.with_file_name(format!("{stem}-signed.{ext}")))
}

pub fn run_command(program: &str, args: &[String]) -> Result<(String, String), AppError> {
    let output = Command::new(program)
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .args(args)
        .output()
        .map_err(|_| AppError::ToolMissing(program.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(AppError::ProcessFailed(format!(
            "{program} failed with status {:?}: {}",
            output.status.code(),
            if stderr.is_empty() { stdout.clone() } else { stderr.clone() }
        )));
    }

    Ok((stdout, stderr))
}

use crate::models::DiscoveredArtifact;

pub fn discover_artifacts(project_root: &str) -> Vec<DiscoveredArtifact> {
    let mut discovered = Vec::new();
    let root = Path::new(project_root);

    if !root.exists() {
        return discovered;
    }

    // Common Gradle output patterns
    let patterns = [
        "app/build/outputs/apk/release/*.apk",
        "app/build/outputs/bundle/release/*.aab",
        "build/libs/*.jar",
    ];

    for pattern in &patterns {
        let full_pattern = format!("{}/{}", project_root, pattern);
        if let Ok(paths) = glob::glob(&full_pattern) {
            for entry in paths.flatten() {
                let name = entry.file_name().and_then(|n| n.to_str()).unwrap_or("unknown").to_string();
                let path = entry.to_string_lossy().to_string();
                let artifact_type = entry.extension().and_then(|e| e.to_str()).unwrap_or("unknown").to_string();

                discovered.push(DiscoveredArtifact {
                    path,
                    name,
                    artifact_type,
                });
            }
        }
    }

    discovered
}
