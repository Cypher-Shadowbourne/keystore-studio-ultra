import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { healthcheck, createKeystore, inspectKeystore } from './api';

// Mock the Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('api.ts - Testing Wrapper Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('healthcheck', () => {
    it('should call invoke with "healthcheck" and return expected result', async () => {
      const mockResult = 'OK';
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await healthcheck();

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith('healthcheck');
      expect(result).toBe(mockResult);
    });
  });

  describe('createKeystore', () => {
    it('should call invoke with "create_keystore" and correct input', async () => {
      const input = {
        path: '/mock/path',
        password: 'password123',
        alias: 'my-alias',
        keyPassword: 'keypassword123',
        validityDays: 10000,
        dname: {
          commonName: 'Test CN',
          organizationUnit: 'Test OU',
          organization: 'Test Org',
          locality: 'Test City',
          state: 'Test State',
          countryCode: 'US'
        }
      };

      const mockResult = {
        path: '/mock/path',
        aliases: ['my-alias'],
        type: 'PKCS12'
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await createKeystore(input);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith('create_keystore', { input });
      expect(result).toBe(mockResult);
    });
  });

  describe('inspectKeystore', () => {
    it('should call invoke with "inspect_keystore" and correct parameters', async () => {
      const path = '/mock/path';
      const alias = 'my-alias';
      const storePassword = 'password123';

      const mockResult = {
        path,
        aliases: [alias],
        type: 'PKCS12',
        certificate: {
          fingerprintSha256: '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF'
        }
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await inspectKeystore(path, alias, storePassword);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith('inspect_keystore', { path, alias, storePassword });
      expect(result).toBe(mockResult);
    });
  });
});
