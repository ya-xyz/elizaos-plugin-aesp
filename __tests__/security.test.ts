import { describe, it, expect, vi } from 'vitest';
import { getAuthorizedOperatorIds, requireAuthorizedOperator, guardFrozenAgent } from '../src/security.js';
import type { IAgentRuntime, Memory, HandlerCallback } from '@elizaos/core';

function makeRuntime(settings: Record<string, string | undefined> = {}): IAgentRuntime {
  return {
    getSetting: vi.fn((key: string) => settings[key]),
  } as unknown as IAgentRuntime;
}

function makeMessage(userId: string): Memory {
  return {
    userId: userId as `${string}-${string}-${string}-${string}-${string}`,
    agentId: '00000000-0000-0000-0000-000000000002' as `${string}-${string}-${string}-${string}-${string}`,
    roomId: '00000000-0000-0000-0000-000000000003' as `${string}-${string}-${string}-${string}-${string}`,
    content: { text: 'test' },
  };
}

describe('getAuthorizedOperatorIds', () => {
  it('returns empty set when no settings configured', () => {
    const ids = getAuthorizedOperatorIds(makeRuntime());
    expect(ids.size).toBe(0);
  });

  it('returns owner user ID', () => {
    const ids = getAuthorizedOperatorIds(makeRuntime({ AESP_OWNER_USER_ID: 'owner-1' }));
    expect(ids.has('owner-1')).toBe(true);
    expect(ids.size).toBe(1);
  });

  it('parses CSV admin IDs', () => {
    const ids = getAuthorizedOperatorIds(makeRuntime({
      AESP_OWNER_USER_ID: 'owner-1',
      AESP_ADMIN_USER_IDS: 'admin-a, admin-b, admin-c',
    }));
    expect(ids.size).toBe(4);
    expect(ids.has('owner-1')).toBe(true);
    expect(ids.has('admin-a')).toBe(true);
    expect(ids.has('admin-b')).toBe(true);
    expect(ids.has('admin-c')).toBe(true);
  });

  it('handles empty/whitespace admin IDs gracefully', () => {
    const ids = getAuthorizedOperatorIds(makeRuntime({
      AESP_OWNER_USER_ID: 'owner-1',
      AESP_ADMIN_USER_IDS: '  ,  , ',
    }));
    expect(ids.size).toBe(1);
  });

  it('trims whitespace from owner ID', () => {
    const ids = getAuthorizedOperatorIds(makeRuntime({ AESP_OWNER_USER_ID: '  owner-1  ' }));
    expect(ids.has('owner-1')).toBe(true);
  });
});

describe('requireAuthorizedOperator', () => {
  it('returns true for authorized user', async () => {
    const runtime = makeRuntime({ AESP_OWNER_USER_ID: 'user-1' });
    const result = await requireAuthorizedOperator(runtime, makeMessage('user-1'));
    expect(result).toBe(true);
  });

  it('returns false and calls callback for unauthorized user', async () => {
    const runtime = makeRuntime({ AESP_OWNER_USER_ID: 'owner-1' });
    const callback = vi.fn();
    const result = await requireAuthorizedOperator(runtime, makeMessage('stranger'), callback);
    expect(result).toBe(false);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Unauthorized'),
    }));
  });

  it('returns false when no operators configured', async () => {
    const runtime = makeRuntime();
    const result = await requireAuthorizedOperator(runtime, makeMessage('anyone'));
    expect(result).toBe(false);
  });

  it('works without callback', async () => {
    const runtime = makeRuntime({ AESP_OWNER_USER_ID: 'owner-1' });
    const result = await requireAuthorizedOperator(runtime, makeMessage('stranger'));
    expect(result).toBe(false);
  });
});

describe('guardFrozenAgent', () => {
  it('returns false when agent is not frozen', async () => {
    const reviewMgr = {
      isAgentFrozen: vi.fn().mockReturnValue(false),
      getFreezeStatus: vi.fn(),
    } as any;
    const result = await guardFrozenAgent(reviewMgr, 'agent-1', 'TEST_ACTION');
    expect(result).toBe(false);
  });

  it('returns true and calls callback when agent is frozen', async () => {
    const reviewMgr = {
      isAgentFrozen: vi.fn().mockReturnValue(true),
      getFreezeStatus: vi.fn().mockReturnValue({ reason: 'security incident' }),
    } as any;
    const callback = vi.fn() as HandlerCallback;
    const result = await guardFrozenAgent(reviewMgr, 'agent-1', 'TEST_ACTION', callback);
    expect(result).toBe(true);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('frozen'),
    }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('security incident'),
    }));
  });

  it('returns true without callback when frozen', async () => {
    const reviewMgr = {
      isAgentFrozen: vi.fn().mockReturnValue(true),
      getFreezeStatus: vi.fn().mockReturnValue(null),
    } as any;
    const result = await guardFrozenAgent(reviewMgr, 'agent-1', 'TEST_ACTION');
    expect(result).toBe(true);
  });
});
