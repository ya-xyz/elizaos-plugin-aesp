/**
 * AESP_COMMIT_PAYMENT — Create EIP-712 commitment
 *
 * Creates a dual-signed structured commitment between buyer and seller agents.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { getCommitmentBuilder, getConfig, trackKnownAgent, getReviewManager } from '../init.js';
import { requireAuthorizedOperator, guardFrozenAgent } from '../security.js';

const CHAIN_ID_MAP: Record<string, number> = {
  ethereum: 1,
  mainnet: 1,
  goerli: 5,
  sepolia: 11155111,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  solana: 0,
};

export const commitPaymentAction: Action = {
  name: 'AESP_COMMIT_PAYMENT',
  description: 'Create an EIP-712 structured payment commitment between two agents. Requires buyer, seller, item, and price.',
  similes: [
    'create commitment',
    'commit payment',
    'escrow payment',
    'payment agreement',
    'sign commitment',
  ],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Create a commitment to pay agent-bob 200 USDC for API access' } },
      { user: '{{agentName}}', content: { text: 'I\'ll create an EIP-712 commitment for this agreement.' } },
    ],
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() ?? '';
    return /\b(commit|commitment|escrow|agreement)\b/.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<unknown> => {
    try {
      if (!(await requireAuthorizedOperator(runtime, message, callback))) {
        return;
      }

      const config = getConfig(runtime);
      const builder = getCommitmentBuilder(runtime);
      const reviewMgr = getReviewManager(runtime);
      const text = message.content.text ?? '';
      if (await guardFrozenAgent(reviewMgr, config.agentId, 'AESP_COMMIT_PAYMENT', callback)) return;

      // Parse commitment details from message
      // Use "agent-xxx" pattern to avoid false matches on words like "to pay"
      const sellerMatch = text.match(/(?:pay|with)\s+(agent[a-zA-Z0-9_-]*|[a-zA-Z0-9_-]*agent[a-zA-Z0-9_-]*)/i)
        ?? text.match(/agent\s+([a-zA-Z0-9_-]+)/i);
      const priceMatch = text.match(/([\d.]+)\s*(\w+)/);
      const itemMatch = text.match(/(?:for)\s+(.+?)(?:\s+at\s+|\s*$)/i);

      const sellerAgent = sellerMatch?.[1] ?? 'unknown-seller';
      const price = priceMatch?.[1] ?? '0';
      const currency = priceMatch?.[2] ?? 'USDC';
      const item = itemMatch?.[1] ?? 'service';

      trackKnownAgent(runtime, sellerAgent);

      const chainId = CHAIN_ID_MAP[config.defaultChain ?? 'ethereum'] ?? 1;
      const record = builder.createCommitment({
        buyerAgent: config.agentId,
        sellerAgent,
        item,
        price,
        currency,
        deliveryDeadline: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
        arbitrator: config.ownerXidentity,
        escrowRequired: true,
        chainId,
      });
      await builder.save();

      if (callback) {
        await callback({
          text: [
            `Commitment created (ID: ${record.id})`,
            `  Buyer:  ${config.agentId}`,
            `  Seller: ${sellerAgent}`,
            `  Item:   ${item}`,
            `  Price:  ${price} ${currency}`,
            `  Status: ${record.status}`,
            ``,
            `The commitment requires dual signing before it becomes active.`,
          ].join('\n'),
        });
      }
    } catch (err) {
      console.error('[AESP] AESP_COMMIT_PAYMENT handler error:', err);
      if (callback) await callback({ text: `Commitment creation failed due to an internal error. Please try again.` });
    }
  },
};
