use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("tool not found or not executable: {0}")]
    ToolMissing(String),
    #[error("process failed: {0}")]
    ProcessFailed(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("secret store error: {0}")]
    SecretStore(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
