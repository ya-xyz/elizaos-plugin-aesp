/**
 * @yault/elizaos-plugin-aesp
 *
 * Policy-gated agent economics for ElizaOS.
 * Wraps AESP (Agent Economic Sovereignty Protocol) into the ElizaOS plugin interface.
 *
 * Features:
 * - 8-check deterministic policy engine
 * - Human-in-the-loop review (auto / review / biometric)
 * - Agent-to-agent negotiation FSM
 * - EIP-712 dual-signed commitments
 * - Budget tracking (daily / weekly / monthly)
 * - Emergency freeze
 */

import type { Plugin, IAgentRuntime } from '@elizaos/core';
import { initAESP } from './init.js';
import { transferAction } from './actions/transfer.js';
import { checkBudgetAction } from './actions/checkBudget.js';
import { negotiateAction } from './actions/negotiate.js';
import { commitPaymentAction } from './actions/commitPayment.js';
import { freezeAgentAction } from './actions/freezeAgent.js';
import { listAgentsAction } from './actions/listAgents.js';
import { budgetProvider } from './providers/budgetProvider.js';
import { policyProvider } from './providers/policyProvider.js';
import { auditEvaluator } from './evaluators/auditEvaluator.js';

/** Extends Plugin with init hook (supported in ElizaOS >=0.2.x, safe to pass in 0.1.x). */
interface PluginWithInit extends Plugin {
  init?: (config: Record<string, string>, runtime: IAgentRuntime) => Promise<void>;
}

export const aespPlugin: PluginWithInit = {
  name: 'plugin-aesp',
  description: 'Policy-gated agent economics: 8-check policy engine, human-in-the-loop, agent-to-agent negotiation, budget tracking',

  init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
    await initAESP(runtime);
  },

  actions: [
    transferAction,
    checkBudgetAction,
    negotiateAction,
    commitPaymentAction,
    freezeAgentAction,
    listAgentsAction,
  ],
  providers: [budgetProvider, policyProvider],
  evaluators: [auditEvaluator],
};

// Re-export for convenience
export { initAESP } from './init.js';
export type { AESPPluginConfig, TransferIntent, NegotiationIntent, CommitmentIntent } from './types.js';

export default aespPlugin;
