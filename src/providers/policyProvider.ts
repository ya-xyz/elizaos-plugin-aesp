/**
 * Policy Provider — Injects active policy summary into agent context
 *
 * Provides the LLM with awareness of what actions are permitted under current policies.
 */

import type { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import { getEngine, getReviewManager, getConfig } from '../init.js';

export const policyProvider: Provider = {
  get: async (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> => {
    try {
      const config = getConfig(runtime);
      const engine = getEngine(runtime);
      const reviewMgr = getReviewManager(runtime);

      const policies = engine.getPoliciesForAgent(config.agentId);
      const isFrozen = reviewMgr.isAgentFrozen(config.agentId);

      if (isFrozen) {
        const freezeStatus = reviewMgr.getFreezeStatus(config.agentId);
        return `AESP Policy: Agent is FROZEN. All economic operations blocked. Reason: ${freezeStatus?.reason ?? 'unknown'}`;
      }

      if (policies.length === 0) {
        return 'AESP Policy: No active policies. All economic actions require human approval.';
      }

      const summaries = policies.map((p) => {
        const c = p.conditions;
        const parts = [`  ${p.agentLabel} (${p.scope})`];
        if (c.allowListChains.length > 0) parts.push(`    Chains: ${c.allowListChains.join(', ')}`);
        if (c.allowListAddresses.length > 0) parts.push(`    Allowed addresses: ${c.allowListAddresses.length} whitelisted`);
        if (c.timeWindow) parts.push(`    Time window: ${c.timeWindow.start}-${c.timeWindow.end}`);
        parts.push(`    Max per-tx: ${c.maxAmountPerTx}`);
        if (p.expiresAt) parts.push(`    Expires: ${p.expiresAt}`);
        return parts.join('\n');
      });

      return `AESP Active Policies (${policies.length}):\n${summaries.join('\n')}`;
    } catch {
      return '';
    }
  },
};
