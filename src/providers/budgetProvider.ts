/**
 * Budget Provider — Injects budget status into agent context
 *
 * Provides the LLM with awareness of current spending limits and remaining budget.
 */

import type { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import { ensureAESPInitialized, getEngine, getConfig } from '../init.js';

export const budgetProvider: Provider = {
  get: async (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> => {
    try {
      await ensureAESPInitialized(runtime);
      const config = getConfig(runtime);
      const engine = getEngine(runtime);
      const budgetTracker = engine.getBudgetTracker();
      const budget = budgetTracker.getBudget(config.agentId);
      const policies = engine.getPoliciesForAgent(config.agentId);

      if (!budget || policies.length === 0) {
        return 'AESP Budget: No active budget policies configured.';
      }

      // Find the most restrictive policy limits
      const limits = policies.reduce(
        (acc, p) => ({
          dailyLimit: Math.min(acc.dailyLimit, Number(p.conditions.maxAmountPerDay)),
          weeklyLimit: Math.min(acc.weeklyLimit, Number(p.conditions.maxAmountPerWeek)),
          monthlyLimit: Math.min(acc.monthlyLimit, Number(p.conditions.maxAmountPerMonth)),
          perTxLimit: Math.min(acc.perTxLimit, Number(p.conditions.maxAmountPerTx)),
        }),
        { dailyLimit: Infinity, weeklyLimit: Infinity, monthlyLimit: Infinity, perTxLimit: Infinity },
      );

      const spent = { daily: Number(budget.dailySpent), weekly: Number(budget.weeklySpent), monthly: Number(budget.monthlySpent) };
      return [
        'AESP Budget Status:',
        `  Daily:   ${budget.dailySpent} spent / ${limits.dailyLimit} limit (${Math.max(0, limits.dailyLimit - spent.daily)} remaining)`,
        `  Weekly:  ${budget.weeklySpent} spent / ${limits.weeklyLimit} limit (${Math.max(0, limits.weeklyLimit - spent.weekly)} remaining)`,
        `  Monthly: ${budget.monthlySpent} spent / ${limits.monthlyLimit} limit (${Math.max(0, limits.monthlyLimit - spent.monthly)} remaining)`,
        `  Max per transaction: ${limits.perTxLimit}`,
      ].join('\n');
    } catch {
      return '';
    }
  },
};
