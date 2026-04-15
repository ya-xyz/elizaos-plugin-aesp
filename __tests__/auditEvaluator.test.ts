import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditEvaluator } from '../src/evaluators/auditEvaluator.js';
import type { Memory, IAgentRuntime } from '@elizaos/core';

const mockEngine = {
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../src/init.js', () => ({
  ensureAESPInitialized: vi.fn().mockResolvedValue(undefined),
  getEngine: () => mockEngine,
}));

function createMessage(text: string, action?: string): Memory {
  return {
    userId: '00000000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    agentId: '00000000-0000-0000-0000-000000000002' as `${string}-${string}-${string}-${string}-${string}`,
    roomId: '00000000-0000-0000-0000-000000000003' as `${string}-${string}-${string}-${string}-${string}`,
    content: { text, action },
  };
}

const mockRuntime = {} as IAgentRuntime;

describe('AESP_AUDIT evaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validate', () => {
    it('returns true when message has AESP_ action field', async () => {
      const result = await auditEvaluator.validate(mockRuntime, createMessage('some text', 'AESP_TRANSFER'));
      expect(result).toBe(true);
    });

    it('returns true when message text contains transfer approval', async () => {
      const result = await auditEvaluator.validate(mockRuntime, createMessage('Transfer approved by policy p-1'));
      expect(result).toBe(true);
    });

    it('returns true when message text contains commitment created', async () => {
      const result = await auditEvaluator.validate(mockRuntime, createMessage('Commitment created (ID: c-1)'));
      expect(result).toBe(true);
    });

    it('returns true when message text contains negotiation started', async () => {
      const result = await auditEvaluator.validate(mockRuntime, createMessage('Negotiation started with agent-bob'));
      expect(result).toBe(true);
    });

    it('returns true when message text contains frozen status', async () => {
      const result = await auditEvaluator.validate(mockRuntime, createMessage('Agent has been FROZEN'));
      expect(result).toBe(true);
    });

    it('returns false for unrelated messages', async () => {
      const result = await auditEvaluator.validate(mockRuntime, createMessage('Hello, how are you?'));
      expect(result).toBe(false);
    });

    it('returns false for empty content', async () => {
      const result = await auditEvaluator.validate(mockRuntime, createMessage(''));
      expect(result).toBe(false);
    });
  });

  describe('handler', () => {
    it('calls engine.save() to persist audit trail', async () => {
      await auditEvaluator.handler(mockRuntime, createMessage('Transfer approved', 'AESP_TRANSFER'));
      expect(mockEngine.save).toHaveBeenCalledTimes(1);
    });

    it('does not throw when engine.save() fails', async () => {
      mockEngine.save.mockRejectedValueOnce(new Error('save failed'));
      await expect(
        auditEvaluator.handler(mockRuntime, createMessage('Transfer approved', 'AESP_TRANSFER')),
      ).resolves.not.toThrow();
    });
  });
});
