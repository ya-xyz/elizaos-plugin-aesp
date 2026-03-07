import { describe, it, expect, vi, beforeEach } from 'vitest';
import { negotiateAction } from '../src/actions/negotiate.js';
import type { Memory, IAgentRuntime } from '@elizaos/core';

const mockSessions = new Map();

vi.mock('../src/init.js', () => {
  const mockFSM = {
    createSession: vi.fn().mockImplementation((params: any) => {
      const session = {
        sessionId: 'session-123',
        myAgentId: params.myAgentId,
        counterpartyAgentId: params.counterpartyAgentId,
        state: 'initial',
        rounds: [],
        maxRounds: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockSessions.set(session.sessionId, session);
      return session;
    }),
    sendOffer: vi.fn().mockImplementation((sessionId: string) => {
      const session = mockSessions.get(sessionId);
      if (session) session.state = 'offer_sent';
      return session;
    }),
    getSession: vi.fn().mockImplementation((id: string) => mockSessions.get(id)),
    accept: vi.fn().mockImplementation((sessionId: string) => {
      const session = mockSessions.get(sessionId);
      if (session) session.state = 'accepted';
      return session;
    }),
    reject: vi.fn().mockImplementation((sessionId: string) => {
      const session = mockSessions.get(sessionId);
      if (session) session.state = 'rejected';
      return session;
    }),
    sendCounter: vi.fn().mockImplementation((sessionId: string) => {
      const session = mockSessions.get(sessionId);
      if (session) session.state = 'countering';
      return session;
    }),
  };
  const mockReviewMgr = {
    isAgentFrozen: vi.fn().mockReturnValue(false),
    getFreezeStatus: vi.fn().mockReturnValue(undefined),
  };
  return {
    getNegotiationFSM: () => mockFSM,
    getReviewManager: () => mockReviewMgr,
    getConfig: () => ({
      ownerXidentity: 'test-xidentity',
      agentId: 'test-agent',
      defaultChain: 'ethereum',
    }),
    trackKnownAgent: vi.fn(),
    __mockFSM: mockFSM,
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

describe('AESP_NEGOTIATE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessions.clear();
  });

  describe('validate', () => {
    it('should match negotiation messages', async () => {
      expect(await negotiateAction.validate(mockRuntime, createMessage('Start a negotiation with agent-bob'))).toBe(true);
      expect(await negotiateAction.validate(mockRuntime, createMessage('Make an offer to agent-alice'))).toBe(true);
    });

    it('should reject non-negotiation messages', async () => {
      expect(await negotiateAction.validate(mockRuntime, createMessage('Check my budget'))).toBe(false);
    });
  });

  describe('handler', () => {
    it('should create a new negotiation session', async () => {
      const { __mockFSM: mockFSM } = await import('../src/init.js') as any;

      const callback = vi.fn();
      await negotiateAction.handler(
        mockRuntime,
        createMessage('Start a negotiation with agent-bob for data access at 50 USDC'),
        undefined,
        undefined,
        callback,
      );

      expect(mockFSM.createSession).toHaveBeenCalledWith(expect.objectContaining({
        myAgentId: 'test-agent',
        counterpartyAgentId: 'agent-bob',
      }));
      expect(mockFSM.sendOffer).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('Negotiation started'),
      }));
    });

    it('should accept an existing session', async () => {
      const { __mockFSM: mockFSM } = await import('../src/init.js') as any;

      // Pre-create a session
      mockSessions.set('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
        sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        myAgentId: 'test-agent',
        counterpartyAgentId: 'agent-bob',
        state: 'offer_received',
        rounds: [{ payload: { item: 'data access' } }],
        maxRounds: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const callback = vi.fn();
      await negotiateAction.handler(
        mockRuntime,
        createMessage('Accept negotiation session: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
        undefined,
        undefined,
        callback,
      );

      expect(mockFSM.accept).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('accepted'),
      }));
    });

    it('should block negotiation when agent is frozen', async () => {
      const { __mockReviewMgr: mockReviewMgr } = await import('../src/init.js') as any;
      mockReviewMgr.isAgentFrozen.mockReturnValue(true);
      mockReviewMgr.getFreezeStatus.mockReturnValue({ reason: 'incident' });

      const callback = vi.fn();
      await negotiateAction.handler(
        mockRuntime,
        createMessage('Start a negotiation with agent-bob for data access at 50 USDC'),
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
