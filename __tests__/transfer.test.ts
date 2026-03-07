import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transferAction } from '../src/actions/transfer.js';
import type { Memory, IAgentRuntime, State } from '@elizaos/core';

// Mock the init module
vi.mock('../src/init.js', () => {
  const mockEngine = {
    checkAutoApprove: vi.fn(),
    recordExecution: vi.fn(),
    getPoliciesForAgent: vi.fn().mockReturnValue([]),
    getBudgetTracker: vi.fn().mockReturnValue({ getBudget: vi.fn() }),
  };
  const mockReviewMgr = {
    createReviewRequestAsync: vi.fn().mockReturnValue({ requestId: 'review-123' }),
    isAgentFrozen: vi.fn().mockReturnValue(false),
    getFreezeStatus: vi.fn().mockReturnValue(undefined),
  };
  return {
    getEngine: () => mockEngine,
    getReviewManager: () => mockReviewMgr,
    getConfig: () => ({
      ownerXidentity: 'test-xidentity',
      agentId: 'test-agent',
      defaultChain: 'ethereum',
    }),
    trackKnownAgent: vi.fn(),
    __mockEngine: mockEngine,
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
  character: { name: 'TestAgent' },
  getSetting: vi.fn(),
} as unknown as IAgentRuntime;

describe('AESP_TRANSFER', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockRuntime.getSetting as any).mockImplementation((key: string) => {
      if (key === 'AESP_OWNER_USER_ID') return '00000000-0000-0000-0000-000000000001';
      return undefined;
    });
  });

  describe('validate', () => {
    it('should match transfer messages', async () => {
      expect(await transferAction.validate(mockRuntime, createMessage('Send 100 USDC to 0x1234567890abcdef1234567890abcdef12345678'))).toBe(true);
      expect(await transferAction.validate(mockRuntime, createMessage('Transfer 50 ETH to 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'))).toBe(true);
    });

    it('should reject non-transfer messages', async () => {
      expect(await transferAction.validate(mockRuntime, createMessage('What is my budget?'))).toBe(false);
      expect(await transferAction.validate(mockRuntime, createMessage('Hello agent'))).toBe(false);
    });
  });

  describe('handler', () => {
    it('should approve transfer when policy matches', async () => {
      const { __mockEngine: mockEngine } = await import('../src/init.js') as any;
      mockEngine.checkAutoApprove.mockResolvedValue('policy-123');

      const callback = vi.fn();
      await transferAction.handler(
        mockRuntime,
        createMessage('Send 100 USDC to 0x1234567890abcdef1234567890abcdef12345678 on ethereum'),
        undefined,
        undefined,
        callback,
      );

      expect(mockEngine.checkAutoApprove).toHaveBeenCalled();
      expect(mockEngine.recordExecution).toHaveBeenCalled();
      expect(mockEngine.recordExecution).toHaveBeenCalledWith(
        expect.any(String),
        'policy-123',
        expect.objectContaining({ error: 'policy_approved_pending_settlement' }),
        expect.any(Object),
      );
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('approved'),
      }));
    });

    it('should create review request when policy rejects', async () => {
      const { __mockEngine: mockEngine, __mockReviewMgr: mockReviewMgr } = await import('../src/init.js') as any;
      mockEngine.checkAutoApprove.mockResolvedValue(null);

      const callback = vi.fn();
      await transferAction.handler(
        mockRuntime,
        createMessage('Send 100 USDC to 0x1234567890abcdef1234567890abcdef12345678'),
        undefined,
        undefined,
        callback,
      );

      expect(mockReviewMgr.createReviewRequestAsync).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('requires human approval'),
      }));
    });

    it('should handle unparseable messages', async () => {
      const callback = vi.fn();
      await transferAction.handler(
        mockRuntime,
        createMessage('do something random'),
        undefined,
        undefined,
        callback,
      );

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('couldn\'t parse'),
      }));
    });

    it('should block unauthorized operator', async () => {
      const callback = vi.fn();
      (mockRuntime.getSetting as any).mockImplementation(() => undefined);

      await transferAction.handler(
        mockRuntime,
        createMessage('Send 100 USDC to 0x1234567890abcdef1234567890abcdef12345678'),
        undefined,
        undefined,
        callback,
      );

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('Unauthorized'),
      }));
    });

    it('should block transfer when agent is frozen', async () => {
      const { __mockReviewMgr: mockReviewMgr } = await import('../src/init.js') as any;
      mockReviewMgr.isAgentFrozen.mockReturnValue(true);
      mockReviewMgr.getFreezeStatus.mockReturnValue({ reason: 'incident' });

      const callback = vi.fn();
      await transferAction.handler(
        mockRuntime,
        createMessage('Send 100 USDC to 0x1234567890abcdef1234567890abcdef12345678'),
        undefined,
        undefined,
        callback,
      );

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('frozen'),
      }));
      mockReviewMgr.isAgentFrozen.mockReturnValue(false);
      mockReviewMgr.getFreezeStatus.mockReturnValue(undefined);
    });
  });
});
