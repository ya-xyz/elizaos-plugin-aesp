import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkBudgetAction } from '../src/actions/checkBudget.js';
import type { Memory, IAgentRuntime } from '@elizaos/core';

vi.mock('../src/init.js', () => {
  const mockBudget = {
    agentId: 'test-agent',
    dailySpent: 50,
    weeklySpent: 200,
    monthlySpent: 800,
    lastResetDaily: new Date().toISOString(),
    lastResetWeekly: new Date().toISOString(),
    lastResetMonthly: new Date().toISOString(),
    transactions: [],
  };
  const mockPolicy = {
    id: 'policy-1',
    agentId: 'test-agent',
    agentLabel: 'Test Policy',
    scope: 'auto_payment',
    conditions: {
      maxAmountPerTx: 100,
      maxAmountPerDay: 500,
      maxAmountPerWeek: 2000,
      maxAmountPerMonth: 5000,
      allowListAddresses: [],
      allowListChains: ['ethereum'],
      allowListMethods: [],
      minBalanceAfter: 0,
      requireReviewBeforeFirstPay: false,
    },
    escalation: 'block',
    createdAt: new Date().toISOString(),
    signature: 'test-sig',
  };
  const mockEngine = {
    getBudgetTracker: () => ({
      getBudget: vi.fn().mockReturnValue(mockBudget),
    }),
    getPoliciesForAgent: vi.fn().mockReturnValue([mockPolicy]),
  };
  return {
    ensureAESPInitialized: vi.fn().mockResolvedValue(undefined),
    getEngine: () => mockEngine,
    getConfig: () => ({
      ownerXidentity: 'test-xidentity',
      agentId: 'test-agent',
      defaultChain: 'ethereum',
    }),
    trackKnownAgent: vi.fn(),
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

const mockRuntime = {} as IAgentRuntime;

describe('AESP_CHECK_BUDGET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validate', () => {
    it('should match budget queries', async () => {
      expect(await checkBudgetAction.validate(mockRuntime, createMessage('What is my budget?'))).toBe(true);
      expect(await checkBudgetAction.validate(mockRuntime, createMessage('Check remaining spending limit'))).toBe(true);
      expect(await checkBudgetAction.validate(mockRuntime, createMessage('How much allowance left?'))).toBe(true);
    });

    it('should reject non-budget messages', async () => {
      expect(await checkBudgetAction.validate(mockRuntime, createMessage('Send 100 USDC'))).toBe(false);
      expect(await checkBudgetAction.validate(mockRuntime, createMessage('Hello'))).toBe(false);
    });
  });

  describe('handler', () => {
    it('should report budget status', async () => {
      const callback = vi.fn();
      await checkBudgetAction.handler(
        mockRuntime,
        createMessage('What is my budget?'),
        undefined,
        undefined,
        callback,
      );

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('Budget status'),
      }));
      // Verify it includes the spending numbers
      const text = callback.mock.calls[0][0].text;
      expect(text).toContain('50');   // dailySpent
      expect(text).toContain('500');  // dailyLimit
      expect(text).toContain('450');  // remaining daily
    });
  });
});
