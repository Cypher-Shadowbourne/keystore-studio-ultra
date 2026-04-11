export type ProjectType = 'apk' | 'aab' | 'jar';

export interface ProjectRecord {
  id: string;
  name: string;
  projectType: ProjectType;
  packageName?: string;
  projectRoot?: string;
  artifactPath?: string;
  outputDir?: string;
  keystorePath?: string;
  alias?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KeystoreCreateInput {
  path: string;
  alias: string;
  dname: string;
  validityDays: number;
  keyAlgorithm: string;
  keySize: number;
  storePassword: string;
  keyPassword: string;
}

export interface KeystoreInfo {
  path: string;
  alias: string;
  owner?: string;
  issuer?: string;
  validFrom?: string;
  validUntil?: string;
  sha1?: string;
  sha256?: string;
  storeType?: string;
}

export interface SigningInput {
  artifactPath: string;
  outputPath?: string;
  keystorePath: string;
  alias: string;
  storePassword: string;
  keyPassword?: string;
  minSdkVersion?: number;
}

export interface CommandResult {
  success: boolean;
  command: string[];
  stdout: string;
  stderr: string;
  outputPath?: string;
}

export interface VerificationResult {
  verified: boolean;
  stdout: string;
  stderr: string;
  signerCertSha1?: string;
  signerCertSha256?: string;
}

export interface SecretRef {
  service: string;
  username: string;
}

export interface SecretStoreInput {
  secretRef: SecretRef;
  password: string;
}
