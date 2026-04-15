/**
 * @yault/elizaos-plugin-aesp — Initialization
 *
 * Instantiates AESP core components per runtime instance.
 */

import {
  PolicyEngine,
  ReviewManager,
  NegotiationStateMachine,
  CommitmentBuilder,
} from '@yault/aesp';
import type { IAgentRuntime } from '@elizaos/core';
import { ElizaStorageAdapter } from './storage.js';
import type { AESPPluginConfig } from './types.js';

interface RuntimeContext {
  policyEngine: PolicyEngine;
  reviewManager: ReviewManager;
  negotiationFSM: NegotiationStateMachine;
  commitmentBuilder: CommitmentBuilder;
  config: AESPPluginConfig;
  knownAgentIds: Set<string>;
}

const contexts = new WeakMap<IAgentRuntime, RuntimeContext>();
const initPromises = new WeakMap<IAgentRuntime, Promise<void>>();
const MAX_KNOWN_AGENTS = 256;
const AGENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function getContext(runtime: IAgentRuntime): RuntimeContext {
  const context = contexts.get(runtime);
  if (!context) {
    throw new Error('AESP plugin not initialized for this runtime. Call initAESP(runtime) first.');
  }
  return context;
}

export function getEngine(runtime: IAgentRuntime): PolicyEngine {
  return getContext(runtime).policyEngine;
}

export function getReviewManager(runtime: IAgentRuntime): ReviewManager {
  return getContext(runtime).reviewManager;
}

export function getNegotiationFSM(runtime: IAgentRuntime): NegotiationStateMachine {
  return getContext(runtime).negotiationFSM;
}

export function getCommitmentBuilder(runtime: IAgentRuntime): CommitmentBuilder {
  return getContext(runtime).commitmentBuilder;
}

export function getConfig(runtime: IAgentRuntime): AESPPluginConfig {
  return getContext(runtime).config;
}

export function trackKnownAgent(runtime: IAgentRuntime, agentId: string): void {
  if (!agentId || !AGENT_ID_PATTERN.test(agentId)) return;
  const known = getContext(runtime).knownAgentIds;
  if (known.has(agentId)) return;
  if (known.size >= MAX_KNOWN_AGENTS) {
    const oldest = known.values().next().value;
    if (oldest) known.delete(oldest);
  }
  known.add(agentId);
}

export function getKnownAgents(runtime: IAgentRuntime): string[] {
  return Array.from(getContext(runtime).knownAgentIds);
}

export async function initAESP(runtime: IAgentRuntime): Promise<void> {
  if (contexts.has(runtime)) return;

  const storage = new ElizaStorageAdapter(runtime);
  await storage.loadKeyIndex();

  // Read config from ElizaOS character settings
  const config: AESPPluginConfig = {
    ownerXidentity: runtime.getSetting('AESP_OWNER_XIDENTITY') ?? '',
    agentId: runtime.getSetting('AESP_AGENT_ID') ?? runtime.agentId,
    defaultChain: (runtime.getSetting('AESP_DEFAULT_CHAIN') ?? 'ethereum').toLowerCase(),
  };

  const policyEngine = new PolicyEngine(storage);
  const reviewManager = new ReviewManager(storage);
  const negotiationFSM = new NegotiationStateMachine(storage);
  const commitmentBuilder = new CommitmentBuilder(storage);

  await policyEngine.load();
  await reviewManager.load();
  await negotiationFSM.load();
  await commitmentBuilder.load();

  contexts.set(runtime, {
    policyEngine,
    reviewManager,
    negotiationFSM,
    commitmentBuilder,
    config,
    knownAgentIds: new Set([config.agentId]),
  });
}

/**
 * Ensure the plugin is initialized for the runtime.
 * Required for ElizaOS versions that do not invoke plugin init hooks.
 */
export async function ensureAESPInitialized(runtime: IAgentRuntime): Promise<void> {
  if (contexts.has(runtime)) return;

  const existing = initPromises.get(runtime);
  if (existing) {
    await existing;
    return;
  }

  const pending = initAESP(runtime);
  initPromises.set(runtime, pending);

  try {
    await pending;
  } finally {
    initPromises.delete(runtime);
  }
}
