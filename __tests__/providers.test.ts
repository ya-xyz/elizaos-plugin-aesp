import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAgentRuntime, Memory } from '@elizaos/core';

const mockBudget = {
  agentId: 'test-agent',
  dailySpent: 100,
  weeklySpent: 400,
  monthlySpent: 1200,
};
const mockPolicy = {
  id: 'p-1',
  agentId: 'test-agent',
  agentLabel: 'Main Policy',
  scope: 'auto_payment',
  conditions: {
    maxAmountPerTx: 200,
    maxAmountPerDay: 1000,
    maxAmountPerWeek: 5000,
    maxAmountPerMonth: 15000,
    allowListAddresses: ['0xabc'],
    allowListChains: ['ethereum', 'polygon'],
    allowListMethods: [],
    minBalanceAfter: 0,
    requireReviewBeforeFirstPay: false,
    timeWindow: null,
  },
  escalation: 'block',
  createdAt: new Date().toISOString(),
  expiresAt: '2026-12-31',
  signature: 'sig',
};

const mockReviewMgr = {
  isAgentFrozen: vi.fn().mockReturnValue(false),
  getFreezeStatus: vi.fn().mockReturnValue(undefined),
};

vi.mock('../src/init.js', () => {
  return {
    ensureAESPInitialized: vi.fn().mockResolvedValue(undefined),
    getEngine: () => ({
      getBudgetTracker: () => ({
        getBudget: vi.fn().mockReturnValue(mockBudget),
      }),
      getPoliciesForAgent: vi.fn().mockReturnValue([mockPolicy]),
    }),
    getReviewManager: () => mockReviewMgr,
    getConfig: () => ({
      ownerXidentity: 'test-xidentity',
      agentId: 'test-agent',
      defaultChain: 'ethereum',
    }),
  };
});

// Must import after mock
const { budgetProvider } = await import('../src/providers/budgetProvider.js');
const { policyProvider } = await import('../src/providers/policyProvider.js');

const mockRuntime = {} as IAgentRuntime;
const mockMessage = { content: { text: 'test' } } as Memory;

describe('budgetProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReviewMgr.isAgentFrozen.mockReturnValue(false);
  });

  it('returns budget status with spending and limits', async () => {
    const result = await budgetProvider.get(mockRuntime, mockMessage);
    expect(result).toContain('AESP Budget Status');
    expect(result).toContain('100');   // dailySpent
    expect(result).toContain('1000');  // dailyLimit
    expect(result).toContain('900');   // remaining daily
  });
});

describe('policyProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReviewMgr.isAgentFrozen.mockReturnValue(false);
  });

  it('returns active policy summary', async () => {
    const result = await policyProvider.get(mockRuntime, mockMessage);
    expect(result).toContain('AESP Active Policies');
    expect(result).toContain('Main Policy');
    expect(result).toContain('ethereum');
    expect(result).toContain('polygon');
    expect(result).toContain('200');  // maxPerTx
    expect(result).toContain('2026-12-31');
  });

  it('returns frozen status when agent is frozen', async () => {
    mockReviewMgr.isAgentFrozen.mockReturnValue(true);
    mockReviewMgr.getFreezeStatus.mockReturnValue({ reason: 'incident' });

    const result = await policyProvider.get(mockRuntime, mockMessage);
    expect(result).toContain('FROZEN');
    expect(result).toContain('incident');
  });
});
