import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ElizaStorageAdapter } from '../src/storage.js';
import type { IAgentRuntime } from '@elizaos/core';

function makeMockRuntime(): IAgentRuntime {
  return {
    cacheManager: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as IAgentRuntime;
}

describe('ElizaStorageAdapter', () => {
  let runtime: IAgentRuntime;
  let storage: ElizaStorageAdapter;

  beforeEach(() => {
    runtime = makeMockRuntime();
    storage = new ElizaStorageAdapter(runtime);
  });

  describe('get/set', () => {
    it('stores and retrieves values from in-memory cache', async () => {
      await storage.set('key1', { data: 'hello' });
      const result = await storage.get<{ data: string }>('key1');
      expect(result).toEqual({ data: 'hello' });
    });

    it('writes through to cacheManager', async () => {
      await storage.set('key1', 42);
      expect(runtime.cacheManager.set).toHaveBeenCalledWith('key1', 42);
    });

    it('falls back to cacheManager on cache miss', async () => {
      (runtime.cacheManager.get as ReturnType<typeof vi.fn>).mockResolvedValue('from-cache');
      const result = await storage.get<string>('missed-key');
      expect(result).toBe('from-cache');
      expect(runtime.cacheManager.get).toHaveBeenCalledWith('missed-key');
    });

    it('returns null when key not found anywhere', async () => {
      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('survives cacheManager.set failure', async () => {
      (runtime.cacheManager.set as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('write failed'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await storage.set('key1', 'value');
      const result = await storage.get('key1');
      expect(result).toBe('value');
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('survives cacheManager.get failure', async () => {
      (runtime.cacheManager.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('read failed'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await storage.get('key1');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('delete', () => {
    it('removes from both cache and cacheManager', async () => {
      await storage.set('key1', 'value');
      await storage.delete('key1');

      const result = await storage.get('key1');
      expect(result).toBeNull();
      expect(runtime.cacheManager.delete).toHaveBeenCalledWith('key1');
    });
  });

  describe('keys', () => {
    it('returns all known keys', async () => {
      await storage.set('policy:1', 'a');
      await storage.set('policy:2', 'b');
      await storage.set('budget:1', 'c');

      const all = await storage.keys();
      expect(all).toHaveLength(3);
      expect(all).toContain('policy:1');
      expect(all).toContain('policy:2');
      expect(all).toContain('budget:1');
    });

    it('filters by prefix', async () => {
      await storage.set('policy:1', 'a');
      await storage.set('policy:2', 'b');
      await storage.set('budget:1', 'c');

      const policyKeys = await storage.keys('policy:');
      expect(policyKeys).toHaveLength(2);
      expect(policyKeys).toContain('policy:1');
      expect(policyKeys).toContain('policy:2');
    });

    it('removes deleted keys from known set', async () => {
      await storage.set('key1', 'a');
      await storage.set('key2', 'b');
      await storage.delete('key1');

      const keys = await storage.keys();
      expect(keys).toEqual(['key2']);
    });

    it('tracks keys discovered via get() from cacheManager', async () => {
      (runtime.cacheManager.get as ReturnType<typeof vi.fn>).mockResolvedValue('cached-value');

      await storage.get('discovered-key');
      const keys = await storage.keys();
      expect(keys).toContain('discovered-key');
    });

    it('persists key index to cacheManager', async () => {
      await storage.set('key1', 'a');
      await storage.set('key2', 'b');

      // Check that the key index is persisted
      const setCalls = (runtime.cacheManager.set as ReturnType<typeof vi.fn>).mock.calls;
      const indexCalls = setCalls.filter(([k]: [string]) => k === '__aesp_key_index__');
      expect(indexCalls.length).toBeGreaterThan(0);
    });

    it('restores key index on cold start via loadKeyIndex', async () => {
      (runtime.cacheManager.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === '__aesp_key_index__') return ['key-a', 'key-b', 'key-c'];
        return null;
      });

      const freshStorage = new ElizaStorageAdapter(runtime);
      await freshStorage.loadKeyIndex();

      const keys = await freshStorage.keys();
      expect(keys).toContain('key-a');
      expect(keys).toContain('key-b');
      expect(keys).toContain('key-c');
    });
  });
});
