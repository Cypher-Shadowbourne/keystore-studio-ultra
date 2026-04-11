import { invoke } from '@tauri-apps/api/core';
import type {
  CommandResult,
  KeystoreCreateInput,
  KeystoreInfo,
  ProjectRecord,
  SecretRef,
  SecretStoreInput,
  SigningInput,
  VerificationResult,
} from './types';

export async function healthcheck(): Promise<string> {
  return invoke('healthcheck');
}

export async function createKeystore(input: KeystoreCreateInput): Promise<KeystoreInfo> {
  return invoke('create_keystore', { input });
}

export async function inspectKeystore(path: string, alias: string, storePassword: string): Promise<KeystoreInfo> {
  return invoke('inspect_keystore', { path, alias, storePassword });
}

export async function signApk(input: SigningInput): Promise<CommandResult> {
  return invoke('sign_apk', { input });
}

export async function verifyApk(path: string): Promise<VerificationResult> {
  return invoke('verify_apk', { path });
}

export async function signJarOrBundle(input: SigningInput): Promise<CommandResult> {
  return invoke('sign_jar_or_bundle', { input });
}

export async function saveSecret(input: SecretStoreInput): Promise<boolean> {
  return invoke('save_secret', { input });
}

export async function loadSecret(secretRef: SecretRef): Promise<string> {
  return invoke('load_secret', { secretRef });
}

export async function deleteSecret(secretRef: SecretRef): Promise<boolean> {
  return invoke('delete_secret', { secretRef });
}

export async function listProjects(): Promise<ProjectRecord[]> {
  return invoke('list_projects');
}

export async function upsertProject(project: ProjectRecord): Promise<ProjectRecord> {
  return invoke('upsert_project', { project });
}

export async function deleteProject(id: string): Promise<boolean> {
  return invoke('delete_project', { id });
}

export async function rotateKeystorePassword(input: {
  keystorePath: string;
  alias: string;
  oldPassword: string;
  newPassword: string;
  isKeyPassword: boolean;
}): Promise<CommandResult> {
  return invoke('rotate_keystore_password', { input });
}

export async function exportCertificate(input: {
  keystorePath: string;
  alias: string;
  storePassword: string;
  outputPath: string;
}): Promise<CommandResult> {
  return invoke('export_certificate', { input });
}

export async function discoverArtifacts(projectRoot: string): Promise<{
  path: string;
  name: string;
  artifactType: string;
}[]> {
  return invoke('discover_artifacts', { projectRoot });
}
