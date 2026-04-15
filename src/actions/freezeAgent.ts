/**
 * AESP_FREEZE_AGENT — Emergency freeze
 *
 * Freezes an agent to block all economic operations immediately.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { ensureAESPInitialized, getReviewManager, getConfig, trackKnownAgent } from '../init.js';
import { requireAuthorizedOperator } from '../security.js';

function parseTargetAgentId(text: string): string | null {
  // Prefer explicit identifiers like "agent-bob" to avoid false captures
  // from natural-language words (e.g. "freeze because ...").
  const directMatch = text.match(/\b(agent[a-zA-Z0-9_-]{1,63})\b/i);
  if (directMatch) return directMatch[1];

  // Also support "agent bob" and normalize to "agent-bob".
  const separatedMatch = text.match(/\bagent\s+([a-zA-Z0-9_-]{1,64})\b/i);
  if (separatedMatch) return `agent-${separatedMatch[1]}`;

  return null;
}

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
      await ensureAESPInitialized(runtime);

      const reviewMgr = getReviewManager(runtime);
      const text = message.content.text ?? '';

      const isUnfreeze = /\bunfreeze\b/i.test(text);
      const agentId = parseTargetAgentId(text) ?? getConfig(runtime).agentId;
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
