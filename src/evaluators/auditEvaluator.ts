/**
 * Audit Evaluator — Post-action audit logging
 *
 * Runs after each message to record any economic actions for the audit trail.
 */

import type { Evaluator, IAgentRuntime, Memory, State } from '@elizaos/core';
import { ensureAESPInitialized, getEngine } from '../init.js';

export const auditEvaluator: Evaluator = {
  name: 'AESP_AUDIT',
  description: 'Records economic action execution results for audit trail and compliance.',
  similes: [
    'audit log',
    'transaction history',
    'execution record',
  ],
  alwaysRun: true,
  examples: [
    {
      context: 'After a transfer action is completed',
      messages: [
        { user: '{{user1}}', content: { text: 'Send 50 USDC to 0x1234...' } },
        { user: '{{agentName}}', content: { text: 'Transfer approved and sent.' } },
      ],
      outcome: 'The transfer is recorded in the audit log with policy ID, amount, and result.',
    },
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory, _state?: State): Promise<boolean> => {
    // Check both the incoming message and recent conversation for AESP actions.
    // The action field may be on the agent's response (not the user message),
    // so we also check the message text for AESP-related keywords as a fallback.
    const action = message.content.action;
    if (typeof action === 'string' && action.startsWith('AESP_')) return true;
    const text = message.content.text ?? '';
    return /\b(Transfer approved|Commitment created|Negotiation (started|accepted|rejected)|has been (FROZEN|unfrozen))\b/.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
  ): Promise<unknown> => {
    try {
      await ensureAESPInitialized(runtime);
      const engine = getEngine(runtime);

      // Save current state to persist audit entries
      await engine.save();
    } catch {
      // Non-critical — audit save failure shouldn't break the agent
    }
    return [];
  },
};
