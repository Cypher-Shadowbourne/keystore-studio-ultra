import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';
import * as api from './api';

// Mock the API module
vi.mock('./api', () => ({
  healthcheck: vi.fn(),
  listProjects: vi.fn(),
  discoverArtifacts: vi.fn(),
  // mock other functions if necessary to avoid errors during rendering
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly on successful startup', async () => {
    vi.mocked(api.healthcheck).mockResolvedValue('System nominal');
    vi.mocked(api.listProjects).mockResolvedValue([
      {
        id: 'test-id',
        name: 'Test Project',
        projectType: 'apk',
        signingProvider: 'local',
        packageName: 'com.test',
        projectRoot: '',
        artifactPath: '',
        outputDir: '',
        keystorePath: '',
        alias: '',
        pkcs11Module: '',
        pkcs11Slot: '',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      }
    ]);

    render(<App />);

    // Wait for the startup to complete and display the healthcheck message
    await waitFor(() => {
      expect(screen.getByText('System nominal')).toBeInTheDocument();
    });

    // Check if the project name is rendered
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });

  it('handles healthcheck failure during startup', async () => {
    vi.mocked(api.healthcheck).mockRejectedValue(new Error('Network error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Startup failed: Error: Network error')).toBeInTheDocument();
    });
  });

  it('handles listProjects failure during startup', async () => {
    vi.mocked(api.healthcheck).mockResolvedValue('System nominal');
    vi.mocked(api.listProjects).mockRejectedValue(new Error('Database unavailable'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Startup failed: Error: Database unavailable')).toBeInTheDocument();
    });
  });
});
