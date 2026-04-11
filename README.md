# Keystore Studio Ultra

A powerful, "cyber-neon" desktop utility for managing Android/Java keystores, secure secret storage, and artifact signing. Built with Tauri 2, React, and Rust.

## Features

- **Keystore Management**: Create modern PKCS#12 keystores with `keytool`.
- **Hardware Token Support**: Optional signing via **PKCS#11** (YubiKey, Google Titan, etc.).
- **Security Tools**:
    - **Password Rotation**: Change Keystore Master or Key Alias passwords with automatic OS Keychain updates.
    - **Certificate Export**: Export public certificates in standard RFC/PEM format (`.pem`, `.crt`).
- **Android Workflow**:
    - **APK Signing**: Automated `zipalign` optimization followed by `apksigner`.
    - **Verification**: Deep inspection of APK signatures and certificate fingerprints.
    - **AAB/JAR Signing**: Native support for Android App Bundles and Java archives via `jarsigner`.
- **Secure by Design**:
    - Passwords for keystores and aliases are stored in the OS credential store (Windows Credential Manager, macOS Keychain, Linux Secret Service) using the `keyring` crate.
    - No sensitive passwords are saved in the project's local JSON database.

## Prerequisites

Ensure the following are in your system **PATH**:

- **Java JDK**: Provides `keytool` and `jarsigner`.
- **Android Build Tools**: Provides `apksigner` and `zipalign`.
- **Rust**: Required for building the backend.

## Getting Started

### Install Dependencies
```bash
npm install
```

### Run in Development Mode
```bash
npm run tauri dev
```

### Build for Production
```bash
npm run tauri build
```

## Project Structure

```text
src/
  api.ts          # Backend bridge
  App.tsx         # Main UI logic & Cyber-Neon styles
  types.ts        # Shared TypeScript interfaces
src-tauri/
  src/
    commands.rs      # Tauri command handlers
    models.rs        # Rust data structures
    signing.rs       # Tool orchestration (keytool, apksigner, etc.)
    project_store.rs # Local project metadata persistence
    tools.rs         # Command execution & I18n helpers
```

## Configuration Note

The project uses a hard-locked Tauri **2.3.0** stack across both NPM and Cargo to ensure perfect synchronization of plugin APIs.

## Next Steps

- [ ] Gradle project detection to automatically find build artifacts.
- [ ] Windows code-signing for the application's own binary.
- [ ] Batch signing for multiple architecture-specific APKs.

---
*Crafted for the elite developer by Cypher Shadowbourne.*
