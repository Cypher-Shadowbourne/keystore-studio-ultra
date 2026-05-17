import { open } from '@tauri-apps/plugin-dialog';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createKeystore,
  deleteProject,
  healthcheck,
  inspectKeystore,
  listProjects,
  loadSecret,
  saveSecret,
  signApk,
  signJarOrBundle,
  upsertProject,
  verifyApk,
  rotateKeystorePassword,
  exportCertificate,
  discoverArtifacts,
} from './api';
import type { KeystoreInfo, ProjectRecord, ProjectType, VerificationResult } from './types';

const STORE_SECRET_SERVICE = 'keystore-forge/store-password';
const KEY_SECRET_SERVICE = 'keystore-forge/key-password';

function uid(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

const defaultProject = (): ProjectRecord => ({
  id: uid(),
  name: '',
  projectType: 'apk',
  signingProvider: 'local',
  packageName: '',
  projectRoot: '',
  artifactPath: '',
  outputDir: '',
  keystorePath: '',
  alias: '',
  pkcs11Module: '',
  pkcs11Slot: '',
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

function statusLabel(status: string, busy: boolean): string {
  if (busy) return 'WORKING';
  if (status.toLowerCase().includes('failed')) return 'CHECK STATUS';
  return 'READY';
}

export default function App() {
  const [status, setStatus] = useState('Booting…');
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectDraft, setProjectDraft] = useState<ProjectRecord>(defaultProject());

  const [keystoreForm, setKeystoreForm] = useState({
    path: '',
    alias: '',
    dname: 'CN=Release, OU=Engineering, O=Example, L=Dublin, ST=Leinster, C=IE',
    validityDays: 9125,
    keyAlgorithm: 'RSA',
    keySize: 4096,
    storePassword: '',
    keyPassword: '',
  });

  const [keystoreInfo, setKeystoreInfo] = useState<KeystoreInfo | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [log, setLog] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const [rotationForm, setRotationForm] = useState({
    oldPassword: '',
    newPassword: '',
    isKeyPassword: false,
  });

  const [exportPath, setExportPath] = useState('');
  const [discoveredArtifacts, setDiscoveredArtifacts] = useState<{path: string, name: string, artifactType: string}[]>([]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    void initialise();
  }, []);

  async function initialise() {
    try {
      const reply = await healthcheck();
      setStatus(reply);
      const saved = await listProjects();
      setProjects(saved);
      if (saved[0]) {
        setSelectedProjectId(saved[0].id);
        setProjectDraft(saved[0]);
      }
    } catch (error) {
      setStatus(`Startup failed: ${String(error)}`);
    }
  }

  function appendLog(message: string) {
    setLog((current) => `${new Date().toLocaleTimeString()}  ${message}\n${current}`);
  }

  function updateDraft<K extends keyof ProjectRecord>(key: K, value: ProjectRecord[K]) {
    setProjectDraft((current) => ({ ...current, [key]: value }));
  }

  async function pickDirectory(key: keyof ProjectRecord) {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: `Select ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
      });
      if (selected && typeof selected === 'string') {
        updateDraft(key, selected);
      }
    } catch (error) {
      appendLog(`Error picking directory: ${String(error)}`);
    }
  }

  async function pickFile(key: keyof ProjectRecord, extensions?: string[]) {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        filters: extensions ? [{ name: 'Artifact', extensions }] : undefined,
        title: `Select ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
      });
      if (selected && typeof selected === 'string') {
        updateDraft(key, selected);
      }
    } catch (error) {
      appendLog(`Error picking file: ${String(error)}`);
    }
  }

  async function pickKeystoreCreatePath() {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: 'Choose where to create keystore',
      });
      if (selected && typeof selected === 'string') {
        setKeystoreForm((current) => ({ ...current, path: selected }));
      }
    } catch (error) {
      appendLog(`Error picking keystore path: ${String(error)}`);
    }
  }

  function onSelectProject(id: string) {
    setSelectedProjectId(id);
    const project = projects.find((item) => item.id === id);
    if (project) {
      setProjectDraft(project);
      setVerifyResult(null);
    }
  }

  async function onSaveProject(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...projectDraft,
        updatedAt: nowIso(),
        createdAt: projectDraft.createdAt || nowIso(),
      };
      const saved = await upsertProject(payload);
      const refreshed: ProjectRecord[] = [];
      let inserted = false;
      for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        if (p.id === saved.id) continue;
        if (!inserted && p.name.localeCompare(saved.name) > 0) {
          refreshed.push(saved);
          inserted = true;
        }
        refreshed.push(p);
      }
      if (!inserted) refreshed.push(saved);
      setProjects(refreshed);
      setSelectedProjectId(saved.id);
      setProjectDraft(saved);
      appendLog(`Saved project ${saved.name}`);
    } catch (error) {
      appendLog(`Project save failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteProject() {
    if (!selectedProject) return;
    setBusy(true);
    try {
      await deleteProject(selectedProject.id);
      const refreshed = projects.filter((p) => p.id !== selectedProject.id);
      setProjects(refreshed);
      const next = refreshed[0] ?? defaultProject();
      setSelectedProjectId(refreshed[0]?.id ?? '');
      setProjectDraft(next);
      setVerifyResult(null);
      appendLog(`Deleted project ${selectedProject.name}`);
    } catch (error) {
      appendLog(`Project delete failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onCreateKeystore(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const info = await createKeystore({
        ...keystoreForm,
        validityDays: Number(keystoreForm.validityDays),
        keySize: Number(keystoreForm.keySize),
      });
      setKeystoreInfo(info);
      await saveSecret({
        secretRef: { service: STORE_SECRET_SERVICE, username: info.path },
        password: keystoreForm.storePassword,
      });
      await saveSecret({
        secretRef: { service: KEY_SECRET_SERVICE, username: `${info.path}:${info.alias}` },
        password: keystoreForm.keyPassword,
      });
      updateDraft('keystorePath', info.path);
      updateDraft('alias', info.alias);
      appendLog(`Created keystore ${info.path} (${info.alias})`);
    } catch (error) {
      appendLog(`Keystore creation failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onInspectKeystore() {
    if (!projectDraft.keystorePath || !projectDraft.alias) {
      appendLog('Keystore inspection skipped: project keystore path or alias missing');
      return;
    }
    setBusy(true);
    try {
      const storePassword = await loadSecret({
        service: STORE_SECRET_SERVICE,
        username: projectDraft.keystorePath,
      });
      const info = await inspectKeystore(projectDraft.keystorePath, projectDraft.alias, storePassword);
      setKeystoreInfo(info);
      appendLog(`Inspected keystore ${info.path}`);
    } catch (error) {
      appendLog(`Keystore inspection failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onSign() {
    if (!selectedProject?.artifactPath || !selectedProject.keystorePath || !selectedProject.alias) {
      appendLog('Signing skipped: project is missing artifact path, keystore path, or alias');
      return;
    }

    setBusy(true);
    try {
      const storePassword = await loadSecret({
        service: STORE_SECRET_SERVICE,
        username: selectedProject.keystorePath,
      });
      const keyPassword = await loadSecret({
        service: KEY_SECRET_SERVICE,
        username: `${selectedProject.keystorePath}:${selectedProject.alias}`,
      });

      const input = {
        artifactPath: selectedProject.artifactPath,
        keystorePath: selectedProject.signingProvider === 'local' ? selectedProject.keystorePath : undefined,
        alias: selectedProject.alias,
        outputPath: selectedProject.outputDir || undefined,
        storePassword,
        keyPassword,
        minSdkVersion: 24,
        provider: selectedProject.signingProvider,
        pkcs11Module: selectedProject.signingProvider === 'pkcs11' ? selectedProject.pkcs11Module : undefined,
        pkcs11Slot: selectedProject.signingProvider === 'pkcs11' ? selectedProject.pkcs11Slot : undefined,
      };

      const type: ProjectType = selectedProject.projectType;
      const result = type === 'apk' ? await signApk(input) : await signJarOrBundle(input);

      appendLog(`Signed ${selectedProject.artifactPath}`);
      appendLog(result.command.join(' '));
      if (result.stdout) appendLog(result.stdout);
      if (result.stderr) appendLog(result.stderr);

      if (type === 'apk' && result.outputPath) {
        const verification = await verifyApk(result.outputPath);
        setVerifyResult(verification);
        appendLog(verification.stdout || 'APK verified');
      }
    } catch (error) {
      appendLog(`Signing failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onRotatePassword(event: FormEvent) {
    event.preventDefault();
    if (!projectDraft.keystorePath || !projectDraft.alias) {
      appendLog('Rotation skipped: keystore path or alias missing');
      return;
    }
    setBusy(true);
    try {
      const result = await rotateKeystorePassword({
        keystorePath: projectDraft.keystorePath,
        alias: projectDraft.alias,
        oldPassword: rotationForm.oldPassword,
        newPassword: rotationForm.newPassword,
        isKeyPassword: rotationForm.isKeyPassword,
      });

      // Update secret store if successful
      if (rotationForm.isKeyPassword) {
        await saveSecret({
          secretRef: { service: KEY_SECRET_SERVICE, username: `${projectDraft.keystorePath}:${projectDraft.alias}` },
          password: rotationForm.newPassword,
        });
      } else {
        await saveSecret({
          secretRef: { service: STORE_SECRET_SERVICE, username: projectDraft.keystorePath },
          password: rotationForm.newPassword,
        });
      }

      appendLog(`Password rotated successfully for ${rotationForm.isKeyPassword ? 'key alias' : 'keystore'}`);
      setRotationForm({ ...rotationForm, oldPassword: '', newPassword: '' });
    } catch (error) {
      appendLog(`Password rotation failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onExportCert() {
    if (!projectDraft.keystorePath || !projectDraft.alias) {
      appendLog('Export skipped: keystore path or alias missing');
      return;
    }

    let path = exportPath;
    if (!path) {
      try {
        const selected = await open({
          directory: false,
          multiple: false,
          title: 'Export Certificate as...',
          filters: [{ name: 'PEM Certificate', extensions: ['pem', 'crt', 'cer'] }]
        });
        if (selected && typeof selected === 'string') {
          path = selected;
          setExportPath(selected);
        } else {
          return;
        }
      } catch (error) {
        appendLog(`Error picking export path: ${String(error)}`);
        return;
      }
    }

    setBusy(true);
    try {
      const storePassword = await loadSecret({
        service: STORE_SECRET_SERVICE,
        username: projectDraft.keystorePath,
      });
      await exportCertificate({
        keystorePath: projectDraft.keystorePath,
        alias: projectDraft.alias,
        storePassword,
        outputPath: path,
      });
      appendLog(`Certificate exported to ${path}`);
    } catch (error) {
      appendLog(`Certificate export failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onDiscover() {
    if (!projectDraft.projectRoot) {
      appendLog('Discovery skipped: project root missing');
      return;
    }
    setBusy(true);
    try {
      const found = await discoverArtifacts(projectDraft.projectRoot);
      setDiscoveredArtifacts(found);
      appendLog(`Found ${found.length} artifacts in project root`);
    } catch (error) {
      appendLog(`Discovery failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const heroStatus = statusLabel(status, busy);

  return (
    <div className="app-shell">
      <header className="hero card-panel">
        <div className="hero-mark">◆</div>
        <div className="hero-copy">
          <p className="eyebrow">SIGNING SUITE</p>
          <h1 className="brand-title">KEYSTORE STUDIO</h1>
          <div className="brand-ultra">ULTRA</div>
          <div className="brand-line" />
          <p className="brand-byline">BY CYPHER SHADOWBOURNE</p>
        </div>
      </header>

      <section className="status-strip-wrap">
        <div className="status-pill">{heroStatus}</div>
      </section>

      <section className="status-card card-panel">
        <h2 className="section-kicker">STATUS</h2>
        <p className="status-main">{busy ? 'Signing operations in flight.' : 'Desktop signing forge online.'}</p>
        <p className="status-sub">{status}</p>
      </section>

      <div className="content-grid">
        <aside className="sidebar-stack">
          <section className="card-panel nav-card">
            <div className="section-head">
              <span className="section-index">1.</span>
              <h2>PROJECTS</h2>
            </div>

            <div className="actions stack-actions">
              <button
                className="cta-button"
                type="button"
                onClick={() => {
                  const next = defaultProject();
                  setProjectDraft(next);
                  setSelectedProjectId('');
                  setVerifyResult(null);
                }}
              >
                + NEW PROJECT
              </button>
            </div>

            <div className="project-list">
              {projects.length === 0 ? (
                <div className="info-card compact-card">
                  <div className="mini-label">MODE</div>
                  <div className="info-value">EMPTY</div>
                  <p className="muted-copy">Create your first signing profile.</p>
                </div>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={project.id === selectedProjectId ? 'project-item active' : 'project-item'}
                    onClick={() => onSelectProject(project.id)}
                  >
                    <span className="project-name">{project.name || 'UNTITLED'}</span>
                    <span className="project-meta">{project.projectType.toUpperCase()}</span>
                    <span className="project-meta faint">{project.packageName || 'No package name set'}</span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="card-panel">
            <div className="section-head">
              <span className="section-index">2.</span>
              <h2>WHAT TO DO</h2>
            </div>
            <div className="stack-grid">
              <div className="info-card compact-card">
                <div className="mini-label">MODE</div>
                <div className="info-value">{selectedProject ? selectedProject.projectType.toUpperCase() : 'IDLE'}</div>
              </div>
              <div className="info-card compact-card">
                <div className="mini-label">DO THIS NOW</div>
                <p className="muted-copy">
                  {selectedProject ? 'Save, inspect the keystore, then sign the selected artifact.' : 'Create or select a project, then wire its artifact and keystore paths.'}
                </p>
              </div>
              <div className="info-card compact-card">
                <div className="mini-label">LAST MESSAGE</div>
                <p className="muted-copy">{log.split('\n').find(Boolean) ?? 'No operations yet.'}</p>
              </div>
            </div>
          </section>
        </aside>

        <main className="main-stack">
          <section className="card-panel">
            <div className="section-head">
              <span className="section-index">3.</span>
              <h2>PROJECT DATA</h2>
            </div>
            <form onSubmit={onSaveProject} className="form-grid">
              <label>
                <span className="field-label">Project name</span>
                <input value={projectDraft.name} onChange={(e) => updateDraft('name', e.target.value)} required />
              </label>
              <label>
                <span className="field-label">Artifact type</span>
                <select
                  value={projectDraft.projectType}
                  onChange={(e) => updateDraft('projectType', e.target.value as ProjectType)}
                >
                  <option value="apk">APK</option>
                  <option value="aab">AAB</option>
                  <option value="jar">JAR</option>
                </select>
              </label>
              <label>
                <span className="field-label">Package name</span>
                <input value={projectDraft.packageName ?? ''} onChange={(e) => updateDraft('packageName', e.target.value)} />
              </label>
              <label>
                <span className="field-label">Signing Provider</span>
                <select
                  value={projectDraft.signingProvider}
                  onChange={(e) => updateDraft('signingProvider', e.target.value as any)}
                >
                  <option value="local">Local Keystore File</option>
                  <option value="pkcs11">Hardware Token (PKCS#11)</option>
                </select>
              </label>
              <label className="field-group">
                <span className="field-label">Project root</span>
                <div className="input-with-action">
                  <input value={projectDraft.projectRoot ?? ''} onChange={(e) => updateDraft('projectRoot', e.target.value)} />
                  <button type="button" className="action-tag" onClick={() => pickDirectory('projectRoot')}>BROWSE</button>
                </div>
              </label>
              <label className="full-width field-group">
                <span className="field-label">Artifact path</span>
                <div className="input-with-action">
                  <input value={projectDraft.artifactPath ?? ''} onChange={(e) => updateDraft('artifactPath', e.target.value)} />
                  <button type="button" className="action-tag" onClick={() => pickFile('artifactPath', [projectDraft.projectType])}>BROWSE</button>
                  <button type="button" className="action-tag" onClick={onDiscover}>DISCOVER</button>
                </div>
              </label>

              {discoveredArtifacts.length > 0 && (
                <div className="full-width discovery-tray">
                  <div className="mini-label">FOUND ARTIFACTS</div>
                  <div className="discovery-scroll">
                    {discoveredArtifacts.map((art) => (
                      <button
                        key={art.path}
                        type="button"
                        className="discovery-item"
                        onClick={() => {
                          updateDraft('artifactPath', art.path);
                          updateDraft('projectType', art.artifactType as any);
                          setDiscoveredArtifacts([]);
                        }}
                      >
                        <span className="art-name">{art.name}</span>
                        <span className="art-type">{art.artifactType.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="full-width field-group">
                <span className="field-label">Output path or directory</span>
                <div className="input-with-action">
                  <input value={projectDraft.outputDir ?? ''} onChange={(e) => updateDraft('outputDir', e.target.value)} />
                  <button type="button" className="action-tag" onClick={() => pickDirectory('outputDir')}>BROWSE</button>
                </div>
              </label>

              {projectDraft.signingProvider === 'local' ? (
                <>
                  <label className="field-group">
                    <span className="field-label">Keystore path</span>
                    <div className="input-with-action">
                      <input value={projectDraft.keystorePath ?? ''} onChange={(e) => updateDraft('keystorePath', e.target.value)} />
                      <button type="button" className="action-tag" onClick={() => pickFile('keystorePath', ['jks', 'keystore', 'p12'])}>BROWSE</button>
                    </div>
                  </label>
                  <label>
                    <span className="field-label">Alias</span>
                    <input value={projectDraft.alias ?? ''} onChange={(e) => updateDraft('alias', e.target.value)} />
                  </label>
                </>
              ) : (
                <>
                  <label className="field-group">
                    <span className="field-label">PKCS#11 Module Path</span>
                    <div className="input-with-action">
                      <input
                        value={projectDraft.pkcs11Module ?? ''}
                        onChange={(e) => updateDraft('pkcs11Module', e.target.value)}
                        placeholder="e.g. C:\Windows\System32\opensc-pkcs11.dll"
                      />
                      <button type="button" className="action-tag" onClick={() => pickFile('pkcs11Module', ['dll', 'so', 'dylib'])}>BROWSE</button>
                    </div>
                  </label>
                  <label>
                    <span className="field-label">Hardware Slot/Alias</span>
                    <input
                      value={projectDraft.alias ?? ''}
                      onChange={(e) => updateDraft('alias', e.target.value)}
                      placeholder="e.g. key-alias-on-token"
                    />
                  </label>
                </>
              )}
              <div className="actions full-width">
                <button className="cta-button" type="submit" disabled={busy}>SAVE PROJECT</button>
                <button className="ghost-button" type="button" disabled={busy} onClick={onInspectKeystore}>INSPECT KEYSTORE</button>
                <button className="danger-button" type="button" disabled={busy || !selectedProject} onClick={onDeleteProject}>DELETE</button>
              </div>
            </form>
          </section>

          <section className="card-panel dual-card-grid">
            <div>
              <div className="section-head">
                <span className="section-index">4.</span>
                <h2>CREATE KEYSTORE</h2>
              </div>
              <form onSubmit={onCreateKeystore} className="form-grid">
                <label className="full-width field-group">
                  <span className="field-label">Keystore path</span>
                  <div className="input-with-action">
                    <input value={keystoreForm.path} onChange={(e) => setKeystoreForm({ ...keystoreForm, path: e.target.value })} required />
                    <button type="button" className="action-tag" onClick={pickKeystoreCreatePath}>BROWSE</button>
                  </div>
                </label>
                <label>
                  <span className="field-label">Alias</span>
                  <input value={keystoreForm.alias} onChange={(e) => setKeystoreForm({ ...keystoreForm, alias: e.target.value })} required />
                </label>
                <label>
                  <span className="field-label">Validity days</span>
                  <input
                    type="number"
                    value={keystoreForm.validityDays}
                    onChange={(e) => setKeystoreForm({ ...keystoreForm, validityDays: Number(e.target.value) })}
                    required
                  />
                </label>
                <label>
                  <span className="field-label">Key algorithm</span>
                  <select value={keystoreForm.keyAlgorithm} onChange={(e) => setKeystoreForm({ ...keystoreForm, keyAlgorithm: e.target.value })}>
                    <option value="RSA">RSA</option>
                    <option value="EC">EC</option>
                  </select>
                </label>
                <label>
                  <span className="field-label">Key size</span>
                  <input
                    type="number"
                    value={keystoreForm.keySize}
                    onChange={(e) => setKeystoreForm({ ...keystoreForm, keySize: Number(e.target.value) })}
                    required
                  />
                </label>
                <label className="full-width">
                  <span className="field-label">Distinguished name</span>
                  <input value={keystoreForm.dname} onChange={(e) => setKeystoreForm({ ...keystoreForm, dname: e.target.value })} required />
                </label>
                <label>
                  <span className="field-label">Store password</span>
                  <input type="password" value={keystoreForm.storePassword} onChange={(e) => setKeystoreForm({ ...keystoreForm, storePassword: e.target.value })} required />
                </label>
                <label>
                  <span className="field-label">Key password</span>
                  <input type="password" value={keystoreForm.keyPassword} onChange={(e) => setKeystoreForm({ ...keystoreForm, keyPassword: e.target.value })} required />
                </label>
                <div className="actions full-width">
                  <button className="cta-button" type="submit" disabled={busy}>CREATE KEYSTORE</button>
                </div>
              </form>
            </div>

            <div>
              <div className="section-head">
                <span className="section-index">5.</span>
                <h2>SIGN & VERIFY</h2>
              </div>
              <div className="actions sign-actions">
                <button className="cta-button" type="button" onClick={onSign} disabled={busy || !selectedProject}>
                  SIGN SELECTED PROJECT
                </button>
              </div>

              {keystoreInfo && (
                <div className="info-card result-card">
                  <div className="mini-label">KEYSTORE</div>
                  <dl className="result-grid">
                    <dt>Path</dt><dd>{keystoreInfo.path}</dd>
                    <dt>Alias</dt><dd>{keystoreInfo.alias}</dd>
                    <dt>Owner</dt><dd>{keystoreInfo.owner ?? '—'}</dd>
                    <dt>Issuer</dt><dd>{keystoreInfo.issuer ?? '—'}</dd>
                    <dt>Valid until</dt><dd>{keystoreInfo.validUntil ?? '—'}</dd>
                    <dt>SHA-1</dt><dd>{keystoreInfo.sha1 ?? '—'}</dd>
                    <dt>SHA-256</dt><dd>{keystoreInfo.sha256 ?? '—'}</dd>
                  </dl>
                </div>
              )}

              {verifyResult && (
                <div className="info-card result-card verify-card">
                  <div className="mini-label">VERIFICATION</div>
                  <p className="status-main small-status">{verifyResult.verified ? 'Artifact verified.' : 'Artifact not verified.'}</p>
                  <p><strong>SHA-1:</strong> {verifyResult.signerCertSha1 ?? '—'}</p>
                  <p><strong>SHA-256:</strong> {verifyResult.signerCertSha256 ?? '—'}</p>
                  <pre>{verifyResult.stdout || verifyResult.stderr}</pre>
                </div>
              )}
            </div>
          </section>

          <section className="card-panel">
            <div className="section-head">
              <span className="section-index">6.</span>
              <h2>SECURITY TOOLS</h2>
            </div>
            <div className="dual-card-grid">
              <div>
                <h3 className="mini-label">PASSWORD ROTATION</h3>
                <form onSubmit={onRotatePassword} className="form-grid">
                  <label>
                    <span className="field-label">Target</span>
                    <select
                      value={rotationForm.isKeyPassword ? 'key' : 'store'}
                      onChange={(e) => setRotationForm({ ...rotationForm, isKeyPassword: e.target.value === 'key' })}
                    >
                      <option value="store">Keystore Master</option>
                      <option value="key">Key Alias Only</option>
                    </select>
                  </label>
                  <label>
                    <span className="field-label">Old Password</span>
                    <input
                      type="password"
                      value={rotationForm.oldPassword}
                      onChange={(e) => setRotationForm({ ...rotationForm, oldPassword: e.target.value })}
                      required
                    />
                  </label>
                  <label className="full-width">
                    <span className="field-label">New Password</span>
                    <input
                      type="password"
                      value={rotationForm.newPassword}
                      onChange={(e) => setRotationForm({ ...rotationForm, newPassword: e.target.value })}
                      required
                    />
                  </label>
                  <div className="actions full-width">
                    <button className="cta-button" type="submit" disabled={busy || !projectDraft.keystorePath}>ROTATE PASSWORD</button>
                  </div>
                </form>
              </div>
              <div>
                <h3 className="mini-label">CERTIFICATE EXPORT</h3>
                <div className="form-grid">
                  <label className="full-width field-group">
                    <span className="field-label">Export Path (.pem)</span>
                    <div className="input-with-action">
                      <input
                        value={exportPath}
                        onChange={(e) => setExportPath(e.target.value)}
                        placeholder="Choose destination..."
                      />
                      <button
                        type="button"
                        className="action-tag"
                        onClick={async () => {
                          const selected = await open({
                            directory: false,
                            multiple: false,
                            filters: [{ name: 'PEM Certificate', extensions: ['pem', 'crt', 'cer'] }]
                          });
                          if (selected && typeof selected === 'string') setExportPath(selected);
                        }}
                      >BROWSE</button>
                    </div>
                  </label>
                  <div className="actions full-width">
                    <button
                      className="cta-button"
                      type="button"
                      disabled={busy || !projectDraft.keystorePath}
                      onClick={onExportCert}
                    >EXPORT PUBLIC CERT</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card-panel">
            <div className="section-head">
              <span className="section-index">7.</span>
              <h2>OPERATION LOG</h2>
            </div>
            <pre className="log-box">{log || 'No operations yet.'}</pre>
          </section>
        </main>
      </div>
    </div>
  );
}
