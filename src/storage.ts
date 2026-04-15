/**
 * @yault/elizaos-plugin-aesp — Storage Adapter
 *
 * Bridges AESP's StorageAdapter interface to ElizaOS runtime cache.
 * Two-tier: in-memory Map (fast) + ElizaOS cacheManager (persistent).
 */

import type { StorageAdapter } from '@yault/aesp';
import type { IAgentRuntime } from '@elizaos/core';

const KEY_INDEX_KEY = '__aesp_key_index__';

export class ElizaStorageAdapter implements StorageAdapter {
  private cache = new Map<string, unknown>();
  /** Tracks all keys ever written, including those only in cacheManager. */
  private knownKeys = new Set<string>();

  constructor(private runtime: IAgentRuntime) {}

  /**
   * Restore the key index from cacheManager on cold start.
   * Call this once before AESP components call load().
   */
  async loadKeyIndex(): Promise<void> {
    try {
      const stored = await this.runtime.cacheManager.get<string[]>(KEY_INDEX_KEY);
      if (Array.isArray(stored)) {
        for (const key of stored) this.knownKeys.add(key);
      }
    } catch {
      // Best-effort — cold start will self-heal via get()/set() calls
    }
  }

  private async persistKeyIndex(): Promise<void> {
    try {
      await this.runtime.cacheManager.set(KEY_INDEX_KEY, Array.from(this.knownKeys));
    } catch {
      // Best-effort
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }
    try {
      const cached = await this.runtime.cacheManager.get<T>(key);
      if (cached !== null && cached !== undefined) {
        this.cache.set(key, cached);
        this.knownKeys.add(key);
        return cached;
      }
    } catch (err) {
      console.warn('[AESP storage] cacheManager.get failed for key:', key);
    }
    return null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.cache.set(key, value);
    const isNew = !this.knownKeys.has(key);
    this.knownKeys.add(key);
    try {
      await this.runtime.cacheManager.set(key, value);
    } catch {
      console.warn('[AESP storage] cacheManager.set failed for key:', key);
    }
    if (isNew) await this.persistKeyIndex();
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    const existed = this.knownKeys.delete(key);
    try {
      await this.runtime.cacheManager.delete(key);
    } catch {
      console.warn('[AESP storage] cacheManager.delete failed for key:', key);
    }
    if (existed) await this.persistKeyIndex();
  }

  async keys(prefix?: string): Promise<string[]> {
    const all = Array.from(this.knownKeys);
    return prefix ? all.filter((k) => k.startsWith(prefix)) : all;
  }
}
