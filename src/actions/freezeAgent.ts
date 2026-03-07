/**
 * AESP_FREEZE_AGENT — Emergency freeze
 *
 * Freezes an agent to block all economic operations immediately.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { getReviewManager, getConfig, trackKnownAgent } from '../init.js';
import { requireAuthorizedOperator } from '../security.js';

export const freezeAgentAction: Action = {
  name: 'AESP_FREEZE_AGENT',
  description: 'Emergency freeze an agent to immediately block all economic operations. Can also unfreeze.',
  similes: [
    'freeze agent',
    'emergency stop',
    'block agent',
    'halt operations',
    'unfreeze agent',
  ],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Freeze agent-bob immediately' } },
      { user: '{{agentName}}', content: { text: 'I\'ll freeze agent-bob right away.' } },
    ],
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() ?? '';
    return /\b(freeze|unfreeze|halt|emergency.?stop|block.?agent)\b/.test(text);
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

      const reviewMgr = getReviewManager(runtime);
      const text = message.content.text ?? '';

      const isUnfreeze = /\bunfreeze\b/i.test(text);
      const agentMatch = text.match(/(?:agent|freeze|unfreeze)\s+([a-zA-Z0-9_-]+)/i);
      const agentId = agentMatch?.[1] ?? getConfig(runtime).agentId;
      trackKnownAgent(runtime, agentId);

      if (isUnfreeze) {
        reviewMgr.unfreezeAgent(agentId);
        if (callback) {
          await callback({
            text: `Agent ${agentId} has been unfrozen. Economic operations are now permitted.`,
          });
        }
      } else {
        const reasonMatch = text.match(/(?:because|reason:?)\s+(.+)/i);
        const reason = reasonMatch?.[1] ?? 'Emergency freeze requested by user';

        reviewMgr.freezeAgent({
          agentId,
          reason,
          initiatedBy: 'human',
          freezeAt: new Date().toISOString(),
        });

        if (callback) {
          await callback({
            text: `Agent ${agentId} has been FROZEN. All economic operations are now blocked.\nReason: ${reason}`,
          });
        }
      }
    } catch (err) {
      console.error('[AESP] AESP_FREEZE_AGENT handler error:', err);
      if (callback) await callback({ text: `Freeze operation failed due to an internal error. Please try again.` });
    }
  },
};
