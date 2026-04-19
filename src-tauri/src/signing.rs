use std::path::Path;

use regex::Regex;

use crate::error::AppError;
use crate::models::{CommandResult, KeystoreCreateInput, KeystoreInfo, PasswordRotationInput, CertificateExportInput, SigningInput, VerificationResult};
use crate::tools::{ensure_parent_dir, output_path_for_signed_artifact, run_command};

pub fn rotate_keystore_password(input: PasswordRotationInput) -> Result<CommandResult, AppError> {
    let mut args = vec![
        "-storepasswd".to_string(),
        "-keystore".to_string(),
        input.keystore_path.clone(),
        "-storepass".to_string(),
        input.old_password.clone(),
        "-new".to_string(),
        input.new_password.clone(),
    ];

    if input.is_key_password {
        args = vec![
            "-keypasswd".to_string(),
            "-keystore".to_string(),
            input.keystore_path.clone(),
            "-alias".to_string(),
            input.alias.clone(),
            "-storepass".to_string(),
            input.old_password.clone(),
            "-new".to_string(),
            input.new_password.clone(),
        ];
    }

    let (stdout, stderr) = run_command("keytool", &args)?;
    Ok(CommandResult {
        success: true,
        command: std::iter::once("keytool".to_string()).chain(redact_args(&args)).collect(),
        stdout,
        stderr,
        output_path: None,
    })
}

pub fn export_certificate(input: CertificateExportInput) -> Result<CommandResult, AppError> {
    let out_path = Path::new(&input.output_path);
    ensure_parent_dir(out_path)?;

    let args = vec![
        "-exportcert".to_string(),
        "-rfc".to_string(),
        "-keystore".to_string(),
        input.keystore_path.clone(),
        "-alias".to_string(),
        input.alias.clone(),
        "-storepass".to_string(),
        input.store_password.clone(),
        "-file".to_string(),
        input.output_path.clone(),
    ];

    let (stdout, stderr) = run_command("keytool", &args)?;
    Ok(CommandResult {
        success: true,
        command: std::iter::once("keytool".to_string()).chain(redact_args(&args)).collect(),
        stdout,
        stderr,
        output_path: Some(input.output_path.clone()),
    })
}

pub fn create_keystore(input: KeystoreCreateInput) -> Result<KeystoreInfo, AppError> {
    let path = Path::new(&input.path);
    ensure_parent_dir(path)?;

    let args = vec![
        "-genkeypair".to_string(),
        "-storetype".to_string(),
        "PKCS12".to_string(),
        "-keystore".to_string(),
        input.path.clone(),
        "-alias".to_string(),
        input.alias.clone(),
        "-dname".to_string(),
        input.dname.clone(),
        "-validity".to_string(),
        input.validity_days.to_string(),
        "-keyalg".to_string(),
        input.key_algorithm.clone(),
        "-keysize".to_string(),
        input.key_size.to_string(),
        "-storepass".to_string(),
        input.store_password.clone(),
        "-keypass".to_string(),
        input.key_password.clone(),
        "-noprompt".to_string(),
    ];

    run_command("keytool", &args)?;
    inspect_keystore(&input.path, &input.alias, &input.store_password)
}

pub fn inspect_keystore(path: &str, alias: &str, store_password: &str) -> Result<KeystoreInfo, AppError> {
    let args = vec![
        "-list".to_string(),
        "-v".to_string(),
        "-keystore".to_string(),
        path.to_string(),
        "-alias".to_string(),
        alias.to_string(),
        "-storepass".to_string(),
        store_password.to_string(),
    ];

    let (stdout, _) = run_command("keytool", &args)?;

    let owner = capture(&stdout, r"Owner: (.+)");
    let issuer = capture(&stdout, r"Issuer: (.+)");
    let valid_from = capture(&stdout, r"Valid from: (.+?) until:");
    let valid_until = capture(&stdout, r"until: (.+)");
    let sha1 = capture(&stdout, r"SHA1: ([A-F0-9:]+)");
    let sha256 = capture(&stdout, r"SHA256: ([A-F0-9:]+)");
    let store_type = capture(&stdout, r"Keystore type: (.+)");

    Ok(KeystoreInfo {
        path: path.to_string(),
        alias: alias.to_string(),
        owner,
        issuer,
        valid_from,
        valid_until,
        sha1,
        sha256,
        store_type,
    })
}

pub fn sign_apk(input: SigningInput) -> Result<CommandResult, AppError> {
    let in_path = Path::new(&input.artifact_path);
    if in_path.extension().and_then(|x| x.to_str()) != Some("apk") {
        return Err(AppError::InvalidInput("APK signing requires a .apk input".into()));
    }

    let out_path = output_path_for_signed_artifact(in_path, input.output_path.as_deref())?;

    // 1. Zipalign (optional step, but recommended before signing)
    // We attempt to run zipalign. If it fails because the tool is missing, we log it and continue
    // as it might already be aligned or the user might not have it installed.
    let mut align_stdout = String::new();
    let mut align_stderr = String::new();
    let mut used_commands = Vec::new();

    let aligned_tmp = out_path.with_extension("aligned.apk");
    let zipalign_args = vec![
        "-f".to_string(),
        "4".to_string(),
        in_path.to_string_lossy().to_string(),
        aligned_tmp.to_string_lossy().to_string(),
    ];

    let sign_input_path = match run_command("zipalign", &zipalign_args) {
        Ok((stdout, stderr)) => {
            align_stdout = stdout;
            align_stderr = stderr;
            used_commands.push(std::iter::once("zipalign".to_string()).chain(zipalign_args).collect::<Vec<_>>().join(" "));
            aligned_tmp.clone()
        }
        Err(_) => {
            // If zipalign fails (e.g. not found), we just use the original input path
            in_path.to_path_buf()
        }
    };

    // 2. Sign with apksigner
    let mut args = vec![
        "sign".to_string(),
    ];

    match input.provider {
        crate::models::SigningProvider::Local => {
            args.push("--ks".to_string());
            args.push(input.keystore_path.unwrap_or_default());
            args.push("--ks-key-alias".to_string());
            args.push(input.alias.clone());
            args.push("--ks-pass".to_string());
            args.push(format!("pass:{}", input.store_password));
            args.push("--key-pass".to_string());
            args.push(format!("pass:{}", input.key_password.unwrap_or_else(|| input.store_password.clone())));
        }
        crate::models::SigningProvider::Pkcs11 => {
            args.push("--provider-class".to_string());
            args.push("sun.security.pkcs11.SunPKCS11".to_string());
            args.push("--provider-arg".to_string());
            args.push(input.pkcs11_module.unwrap_or_default());
            args.push("--ks".to_string());
            args.push("NONE".to_string());
            args.push("--ks-type".to_string());
            args.push("PKCS11".to_string());
            args.push("--ks-key-alias".to_string());
            args.push(input.alias.clone());
            args.push("--ks-pass".to_string());
            args.push(format!("pass:{}", input.store_password));
        }
    }

    args.push("--out".to_string());
    args.push(out_path.to_string_lossy().to_string());

    if let Some(min_sdk_version) = input.min_sdk_version {
        args.push("--min-sdk-version".to_string());
        args.push(min_sdk_version.to_string());
    }

    args.push(sign_input_path.to_string_lossy().to_string());

    let (stdout, stderr) = run_command("apksigner", &args)?;

    // Clean up temp aligned file if we created it
    if sign_input_path != in_path {
        let _ = std::fs::remove_file(sign_input_path);
    }

    let mut final_stdout = align_stdout;
    if !final_stdout.is_empty() { final_stdout.push_str("\n"); }
    final_stdout.push_str(&stdout);

    let mut final_stderr = align_stderr;
    if !final_stderr.is_empty() { final_stderr.push_str("\n"); }
    final_stderr.push_str(&stderr);

    used_commands.push(std::iter::once("apksigner".to_string()).chain(redact_args(&args)).collect::<Vec<_>>().join(" "));

    Ok(CommandResult {
        success: true,
        command: used_commands,
        stdout: final_stdout,
        stderr: final_stderr,
        output_path: Some(out_path.to_string_lossy().to_string()),
    })
}

pub fn verify_apk(path: &str) -> Result<VerificationResult, AppError> {
    let args = vec![
        "verify".to_string(),
        "--verbose".to_string(),
        "--print-certs".to_string(),
        path.to_string(),
    ];
    let (stdout, stderr) = run_command("apksigner", &args)?;

    Ok(VerificationResult {
        verified: true,
        signer_cert_sha1: capture(&stdout, r"Signer #1 certificate SHA-1 digest: ([A-F0-9:]+)"),
        signer_cert_sha256: capture(&stdout, r"Signer #1 certificate SHA-256 digest: ([A-F0-9:]+)"),
        stdout,
        stderr,
    })
}

pub fn sign_jar_or_bundle(input: SigningInput) -> Result<CommandResult, AppError> {
    let in_path = Path::new(&input.artifact_path);
    let ext = in_path.extension().and_then(|value| value.to_str()).unwrap_or_default();
    if ext != "jar" && ext != "aab" {
        return Err(AppError::InvalidInput("JAR/AAB signing requires a .jar or .aab input".into()));
    }

    let out_path = output_path_for_signed_artifact(in_path, input.output_path.as_deref())?;
    std::fs::copy(in_path, &out_path)?;

    let mut args = Vec::new();

    match input.provider {
        crate::models::SigningProvider::Local => {
            args.push("-keystore".to_string());
            args.push(input.keystore_path.unwrap_or_default());
            args.push("-storepass".to_string());
            args.push(input.store_password.clone());
            args.push("-keypass".to_string());
            args.push(input.key_password.unwrap_or_else(|| input.store_password.clone()));
        }
        crate::models::SigningProvider::Pkcs11 => {
            args.push("-providerClass".to_string());
            args.push("sun.security.pkcs11.SunPKCS11".to_string());
            args.push("-providerArg".to_string());
            args.push(input.pkcs11_module.unwrap_or_default());
            args.push("-keystore".to_string());
            args.push("NONE".to_string());
            args.push("-storetype".to_string());
            args.push("PKCS11".to_string());
            args.push("-storepass".to_string());
            args.push(input.store_password.clone());
        }
    }

    args.push(out_path.to_string_lossy().to_string());
    args.push(input.alias.clone());

    let (stdout, stderr) = run_command("jarsigner", &args)?;
    Ok(CommandResult {
        success: true,
        command: std::iter::once("jarsigner".to_string()).chain(redact_args(&args)).collect(),
        stdout,
        stderr,
        output_path: Some(out_path.to_string_lossy().to_string()),
    })
}

fn redact_args(args: &[String]) -> Vec<String> {
    let mut redacted = Vec::new();
    let mut skip_next = false;

    let sensitive_flags = [
        "-storepass",
        "-keypass",
        "-keypasswd",
        "-new",
        "--ks-pass",
        "--key-pass",
    ];

    for arg in args {
        if skip_next {
            redacted.push("***".to_string());
            skip_next = false;
        } else if sensitive_flags.contains(&arg.as_str()) {
            redacted.push(arg.clone());
            skip_next = true;
        } else {
            redacted.push(arg.clone());
        }
    }

    redacted
}

fn capture(source: &str, pattern: &str) -> Option<String> {
    Regex::new(pattern)
        .ok()?
        .captures(source)?
        .get(1)
        .map(|m| m.as_str().trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redact_args() {
        let args: Vec<String> = vec![
            "keytool".to_string(),
            "-storepass".to_string(),
            "my_super_secret_password".to_string(),
            "-keystore".to_string(),
            "keystore.jks".to_string(),
        ];
        let redacted = redact_args(&args);
        assert_eq!(redacted.len(), 5);
        assert_eq!(redacted[0], "keytool");
        assert_eq!(redacted[1], "-storepass");
        assert_eq!(redacted[2], "***");
        assert_eq!(redacted[3], "-keystore");
        assert_eq!(redacted[4], "keystore.jks");

        let args_apksigner: Vec<String> = vec![
            "apksigner".to_string(),
            "sign".to_string(),
            "--ks".to_string(),
            "my.keystore".to_string(),
            "--ks-pass".to_string(),
            "pass:secret123".to_string(),
            "app.apk".to_string(),
        ];
        let redacted_apk = redact_args(&args_apksigner);
        assert_eq!(redacted_apk.len(), 7);
        assert_eq!(redacted_apk[4], "--ks-pass");
        assert_eq!(redacted_apk[5], "***");
    }
}
