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
  packageName: '',
  projectRoot: '',
  artifactPath: '',
  outputDir: '',
  keystorePath: '',
  alias: '',
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
      const refreshed = [...projects.filter((p) => p.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name));
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
        keystorePath: selectedProject.keystorePath,
        alias: selectedProject.alias,
        outputPath: selectedProject.outputDir || undefined,
        storePassword,
        keyPassword,
        minSdkVersion: 24,
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
                <span className="field-label">Project root</span>
                <input value={projectDraft.projectRoot ?? ''} onChange={(e) => updateDraft('projectRoot', e.target.value)} />
              </label>
              <label className="full-width">
                <span className="field-label">Artifact path</span>
                <input value={projectDraft.artifactPath ?? ''} onChange={(e) => updateDraft('artifactPath', e.target.value)} />
              </label>
              <label className="full-width">
                <span className="field-label">Output path or directory</span>
                <input value={projectDraft.outputDir ?? ''} onChange={(e) => updateDraft('outputDir', e.target.value)} />
              </label>
              <label>
                <span className="field-label">Keystore path</span>
                <input value={projectDraft.keystorePath ?? ''} onChange={(e) => updateDraft('keystorePath', e.target.value)} />
              </label>
              <label>
                <span className="field-label">Alias</span>
                <input value={projectDraft.alias ?? ''} onChange={(e) => updateDraft('alias', e.target.value)} />
              </label>
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
                <label className="full-width">
                  <span className="field-label">Keystore path</span>
                  <input value={keystoreForm.path} onChange={(e) => setKeystoreForm({ ...keystoreForm, path: e.target.value })} required />
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
              <h2>OPERATION LOG</h2>
            </div>
            <pre className="log-box">{log || 'No operations yet.'}</pre>
          </section>
        </main>
      </div>
    </div>
  );
}
