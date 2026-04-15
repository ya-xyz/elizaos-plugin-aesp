import { describe, it, expect, vi, beforeEach } from 'vitest';
import { freezeAgentAction } from '../src/actions/freezeAgent.js';
import type { Memory, IAgentRuntime } from '@elizaos/core';

vi.mock('../src/init.js', () => {
  const mockReviewMgr = {
    freezeAgent: vi.fn(),
    unfreezeAgent: vi.fn(),
    isAgentFrozen: vi.fn().mockReturnValue(false),
    getFreezeStatus: vi.fn().mockReturnValue(undefined),
  };
  return {
    ensureAESPInitialized: vi.fn().mockResolvedValue(undefined),
    getReviewManager: () => mockReviewMgr,
    getConfig: () => ({
      ownerXidentity: 'test-xidentity',
      agentId: 'my-agent',
      defaultChain: 'ethereum',
    }),
    trackKnownAgent: vi.fn(),
    __mockReviewMgr: mockReviewMgr,
  };
});

function createMessage(text: string): Memory {
  return {
    userId: '00000000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    agentId: '00000000-0000-0000-0000-000000000002' as `${string}-${string}-${string}-${string}-${string}`,
    roomId: '00000000-0000-0000-0000-000000000003' as `${string}-${string}-${string}-${string}-${string}`,
    content: { text },
  };
}

const mockRuntime = {
  getSetting: vi.fn((key: string) => {
    if (key === 'AESP_OWNER_USER_ID') return '00000000-0000-0000-0000-000000000001';
    return undefined;
  }),
} as unknown as IAgentRuntime;

describe('AESP_FREEZE_AGENT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockRuntime.getSetting as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'AESP_OWNER_USER_ID') return '00000000-0000-0000-0000-000000000001';
      return undefined;
    });
  });

  describe('validate', () => {
    it('should match freeze commands', async () => {
      expect(await freezeAgentAction.validate(mockRuntime, createMessage('Freeze agent-bob'))).toBe(true);
      expect(await freezeAgentAction.validate(mockRuntime, createMessage('unfreeze agent-bob'))).toBe(true);
      expect(await freezeAgentAction.validate(mockRuntime, createMessage('emergency stop'))).toBe(true);
      expect(await freezeAgentAction.validate(mockRuntime, createMessage('halt operations'))).toBe(true);
    });

    it('should reject non-freeze messages', async () => {
      expect(await freezeAgentAction.validate(mockRuntime, createMessage('Send 100 USDC'))).toBe(false);
      expect(await freezeAgentAction.validate(mockRuntime, createMessage('Check budget'))).toBe(false);
    });
  });

  describe('handler', () => {
    it('should freeze an agent', async () => {
      const { __mockReviewMgr: mockReviewMgr } = await import('../src/init.js') as any;
      const callback = vi.fn();

      await freezeAgentAction.handler(
        mockRuntime,
        createMessage('Freeze agent-bob because suspicious activity'),
        undefined,
        undefined,
        callback,
      );

      expect(mockReviewMgr.freezeAgent).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-bob',
        reason: 'suspicious activity',
        initiatedBy: 'human',
      }));
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('FROZEN'),
      }));
    });

    it('should unfreeze an agent', async () => {
      const { __mockReviewMgr: mockReviewMgr } = await import('../src/init.js') as any;
      const callback = vi.fn();

      await freezeAgentAction.handler(
        mockRuntime,
        createMessage('Unfreeze agent-bob'),
        undefined,
        undefined,
        callback,
      );

      expect(mockReviewMgr.unfreezeAgent).toHaveBeenCalledWith('agent-bob');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('unfrozen'),
      }));
    });

    it('should default to own agent when no agent specified', async () => {
      const { __mockReviewMgr: mockReviewMgr } = await import('../src/init.js') as any;
      const callback = vi.fn();

      await freezeAgentAction.handler(
        mockRuntime,
        createMessage('emergency stop now'),
        undefined,
        undefined,
        callback,
      );

      // "emergency stop" doesn't match the agentMatch regex, so defaults to config.agentId
      expect(mockReviewMgr.freezeAgent).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'my-agent',
      }));
    });

    it('should not parse filler words as target agent', async () => {
      const { __mockReviewMgr: mockReviewMgr } = await import('../src/init.js') as any;
      const callback = vi.fn();

      await freezeAgentAction.handler(
        mockRuntime,
        createMessage('Freeze because suspicious activity'),
        undefined,
        undefined,
        callback,
      );

      expect(mockReviewMgr.freezeAgent).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'my-agent',
      }));
    });

    it('should block unauthorized operator', async () => {
      (mockRuntime.getSetting as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
      const callback = vi.fn();

      await freezeAgentAction.handler(
        mockRuntime,
        createMessage('Freeze agent-bob'),
        undefined,
        undefined,
        callback,
      );

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('Unauthorized'),
      }));
    });
  });
});
