/**
 * AESP_CHECK_BUDGET — Query remaining budget
 *
 * Reports daily/weekly/monthly spending limits and remaining amounts.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { getEngine, getConfig } from '../init.js';

export const checkBudgetAction: Action = {
  name: 'AESP_CHECK_BUDGET',
  description: 'Check the remaining spending budget for this agent across daily, weekly, and monthly periods.',
  similes: [
    'check budget',
    'remaining budget',
    'spending limit',
    'how much can I spend',
    'budget status',
  ],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'What\'s my remaining budget?' } },
      { user: '{{agentName}}', content: { text: 'Let me check your budget status.' } },
    ],
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() ?? '';
    return /\b(budget|spending|limit|allowance|remaining)\b/.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<unknown> => {
    try {
      const config = getConfig(runtime);
      const engine = getEngine(runtime);
      const budgetTracker = engine.getBudgetTracker();

      const budget = budgetTracker.getBudget(config.agentId);
      const policies = engine.getPoliciesForAgent(config.agentId);

      if (!budget || policies.length === 0) {
        if (callback) {
          await callback({
            text: 'No budget tracking data or active policies found for this agent.',
          });
        }
        return;
      }

      // Summarize across all policies
      const summaries = policies.map((policy) => {
        const c = policy.conditions;
        const dailyLimit = Number(c.maxAmountPerDay);
        const weeklyLimit = Number(c.maxAmountPerWeek);
        const monthlyLimit = Number(c.maxAmountPerMonth);
        const spent = { daily: Number(budget.dailySpent), weekly: Number(budget.weeklySpent), monthly: Number(budget.monthlySpent) };
        return [
          `Policy: ${policy.agentLabel} (${policy.scope})`,
          `  Daily:   spent ${budget.dailySpent} / limit ${c.maxAmountPerDay} (remaining: ${Math.max(0, dailyLimit - spent.daily)})`,
          `  Weekly:  spent ${budget.weeklySpent} / limit ${c.maxAmountPerWeek} (remaining: ${Math.max(0, weeklyLimit - spent.weekly)})`,
          `  Monthly: spent ${budget.monthlySpent} / limit ${c.maxAmountPerMonth} (remaining: ${Math.max(0, monthlyLimit - spent.monthly)})`,
          `  Per-tx limit: ${c.maxAmountPerTx}`,
        ].join('\n');
      });

      if (callback) {
        await callback({
          text: `Budget status for agent ${config.agentId}:\n\n${summaries.join('\n\n')}`,
        });
      }
    } catch (err) {
      console.error('[AESP] AESP_CHECK_BUDGET handler error:', err);
      if (callback) await callback({ text: `Budget check failed due to an internal error. Please try again.` });
    }
  },
};
