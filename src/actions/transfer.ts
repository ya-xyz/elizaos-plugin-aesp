/**
 * AESP_TRANSFER — Policy-gated token transfer
 *
 * Validates the transfer against AESP policy engine.
 * If policy rejects, creates a human-in-the-loop review request.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { ensureAESPInitialized, getEngine, getReviewManager, getConfig, trackKnownAgent } from '../init.js';
import { requireAuthorizedOperator, guardFrozenAgent } from '../security.js';
import { generateUUID } from '@yault/aesp';
import type { AgentExecutionRequest, TransferPayload } from '@yault/aesp';
import type { TransferIntent } from '../types.js';

function parseTransferIntent(text: string, defaultChain: string): TransferIntent | null {
  // Parse "send/transfer/pay X TOKEN to ADDRESS on CHAIN" pattern
  const match = text.match(
    /(?:send|transfer|pay)\s+([\d.]+)\s+(\w+)\s+to\s+(0x[a-fA-F0-9]{40}|[a-zA-Z0-9]{32,44})(?:\s+on\s+(\w+))?/i,
  );
  if (!match) return null;
  return {
    amount: match[1],
    token: match[2].toLowerCase(),
    toAddress: match[3],
    chainId: (match[4] ?? defaultChain).toLowerCase(),
  };
}

export const transferAction: Action = {
  name: 'AESP_TRANSFER',
  description: 'Execute a policy-gated token transfer. The transfer is checked against AESP policies before execution.',
  similes: [
    'send tokens',
    'transfer funds',
    'pay someone',
    'make a payment',
    'send crypto',
  ],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Send 100 USDC to 0x1234567890abcdef1234567890abcdef12345678 on ethereum' } },
      { user: '{{agentName}}', content: { text: 'I\'ll check the policy and process this transfer.' } },
    ],
  ],

  validate: async (runtime: IAgentRuntime, message: Memory, _state?: State): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() ?? '';
    return /\b(send|transfer|pay)\b/.test(text) && /\b(0x[a-f0-9]{40}|[a-z0-9]{32,44})\b/i.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<unknown> => {
    try {
      if (!(await requireAuthorizedOperator(runtime, message, callback))) {
        return;
      }
      await ensureAESPInitialized(runtime);

      const config = getConfig(runtime);
      const engine = getEngine(runtime);
      const reviewMgr = getReviewManager(runtime);
      if (await guardFrozenAgent(reviewMgr, config.agentId, 'AESP_TRANSFER', callback)) return;

      const intent = parseTransferIntent(message.content.text ?? '', config.defaultChain ?? 'ethereum');
      if (!intent) {
        if (callback) {
          await callback({ text: 'I couldn\'t parse the transfer details. Please use format: "send AMOUNT TOKEN to ADDRESS on CHAIN"' });
        }
        return;
      }

      trackKnownAgent(runtime, config.agentId);

      const payload: TransferPayload = {
        chainId: intent.chainId,
        token: intent.token === 'native' ? 'native' : intent.token,
        toAddress: intent.toAddress,
        amount: intent.amount,
        memo: intent.memo,
      };

      const request: AgentExecutionRequest = {
        requestId: generateUUID(),
        vendorId: config.agentId,
        action: { type: 'transfer', payload },
      };

      // Run 8-check policy engine
      const approvedPolicyId = await engine.checkAutoApprove(request);

      if (approvedPolicyId) {
        await engine.recordExecution(request.requestId, approvedPolicyId, {
          success: true,
          requestId: request.requestId,
          timestamp: Date.now(),
        }, request);

        if (callback) {
          await callback({
            text: `Transfer approved by policy ${approvedPolicyId}. Settlement is pending downstream execution for ${intent.amount} ${intent.token} to ${intent.toAddress} on ${intent.chainId}.`,
            action: 'AESP_TRANSFER',
          });
        }
      } else {
        const reviewRequest = reviewMgr.createReviewRequestAsync({
          agentId: config.agentId,
          agentLabel: runtime.character?.name ?? 'Agent',
          action: 'transfer',
          summary: `Transfer ${intent.amount} ${intent.token} to ${intent.toAddress}`,
          details: {
            chain: intent.chainId,
            to: intent.toAddress,
            amount: intent.amount,
            currency: intent.token,
          },
          policyViolation: {
            rule: 'no_matching_policy',
            actual: `${intent.amount} ${intent.token}`,
            limit: 'none approved',
          },
          urgency: 'normal',
        });

        if (callback) {
          await callback({
            text: `Transfer of ${intent.amount} ${intent.token} to ${intent.toAddress} requires human approval. Review request ${reviewRequest.requestId} has been created. Awaiting owner confirmation.`,
            action: 'AESP_TRANSFER',
          });
        }
      }
    } catch (err) {
      console.error('[AESP] AESP_TRANSFER handler error:', err);
      if (callback) await callback({ text: `Transfer failed due to an internal error. Please try again.` });
    }
  },
};
