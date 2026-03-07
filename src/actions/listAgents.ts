/**
 * AESP_LIST_AGENTS — List sub-agents and their policies
 *
 * Lists all agents with active policies and their current status.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { getEngine, getReviewManager, getConfig, getKnownAgents } from '../init.js';
import { requireAuthorizedOperator } from '../security.js';

export const listAgentsAction: Action = {
  name: 'AESP_LIST_AGENTS',
  description: 'List all sub-agents with their active policies, budget status, and freeze status.',
  similes: [
    'list agents',
    'show agents',
    'agent status',
    'sub-agents',
    'managed agents',
  ],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'List all my agents' } },
      { user: '{{agentName}}', content: { text: 'Here are your managed agents and their status.' } },
    ],
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() ?? '';
    return /\b(list|show|all)\b.*\b(agent|sub.?agent)\b/.test(text);
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

      const engine = getEngine(runtime);
      const reviewMgr = getReviewManager(runtime);
      const config = getConfig(runtime);

      // Collect unique agent IDs from every source we can reliably query.
      const agentIds = new Set<string>();
      for (const id of getKnownAgents(runtime)) {
        agentIds.add(id);
      }
      agentIds.add(config.agentId);

      const pendingReviews = reviewMgr.getPendingRequests();
      for (const item of pendingReviews) {
        agentIds.add(item.request.agentId);
      }

      const budgetTracker = engine.getBudgetTracker();

      if (agentIds.size === 0) {
        if (callback) {
          await callback({
            text: 'No sub-agents with active policies or pending reviews found.',
          });
        }
        return;
      }

      const lines: string[] = ['Managed agents:\n'];
      for (const agentId of agentIds) {
        const frozen = reviewMgr.isAgentFrozen(agentId);
        const freezeStatus = reviewMgr.getFreezeStatus(agentId);
        const budget = budgetTracker.getBudget(agentId);
        const policies = engine.getPoliciesForAgent(agentId);
        const agentPendingReviews = pendingReviews.filter((r) => r.request.agentId === agentId);

        lines.push(`Agent: ${agentId}`);
        lines.push(`  Status: ${frozen ? `FROZEN (${freezeStatus?.reason})` : 'Active'}`);
        lines.push(`  Policies: ${policies.length}`);
        lines.push(`  Pending reviews: ${agentPendingReviews.length}`);
        if (budget) {
          lines.push(`  Daily spent: ${budget.dailySpent} | Weekly: ${budget.weeklySpent} | Monthly: ${budget.monthlySpent}`);
        }
        lines.push('');
      }

      if (callback) {
        await callback({ text: lines.join('\n') });
      }
    } catch (err) {
      console.error('[AESP] AESP_LIST_AGENTS handler error:', err);
      if (callback) await callback({ text: `Failed to list agents due to an internal error. Please try again.` });
    }
  },
};
