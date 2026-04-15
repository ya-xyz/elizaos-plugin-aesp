/**
 * AESP_NEGOTIATE — Agent-to-agent negotiation
 *
 * Manages negotiation sessions using AESP's NegotiationStateMachine.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { ensureAESPInitialized, getNegotiationFSM, getConfig, trackKnownAgent, getReviewManager } from '../init.js';
import { requireAuthorizedOperator, guardFrozenAgent } from '../security.js';
import type { NegotiationOffer, NegotiationCounterOffer, NegotiationAcceptance, NegotiationRejection } from '@yault/aesp';

export const negotiateAction: Action = {
  name: 'AESP_NEGOTIATE',
  description: 'Start or continue an agent-to-agent negotiation session. Supports offers, counter-offers, acceptance, and rejection.',
  similes: [
    'negotiate',
    'make an offer',
    'counter offer',
    'start negotiation',
    'agent deal',
  ],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Start a negotiation with agent-bob for data access at 50 USDC' } },
      { user: '{{agentName}}', content: { text: 'I\'ll start a negotiation session with agent-bob.' } },
    ],
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() ?? '';
    return /\b(negotiate|negotiation|offer|counter.?offer|deal)\b/.test(text);
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

      const config = getConfig(runtime);
      const fsm = getNegotiationFSM(runtime);
      const reviewMgr = getReviewManager(runtime);
      const text = message.content.text ?? '';
      if (await guardFrozenAgent(reviewMgr, config.agentId, 'AESP_NEGOTIATE', callback)) return;

      // Detect action type
      const isAccept = /\baccept\b/i.test(text);
      const isReject = /\breject\b/i.test(text);
      const isCounter = /\bcounter/i.test(text);

      // Check for existing session reference
      const sessionMatch = text.match(/session[:\s]+([a-f0-9-]{36})/i);
      const sessionId = sessionMatch?.[1];

      if (sessionId && (isAccept || isReject || isCounter)) {
        const session = fsm.getSession(sessionId);
        if (!session) {
          if (callback) await callback({ text: `Negotiation session ${sessionId} not found.` });
          return;
        }

        if (isAccept) {
          const acceptance: NegotiationAcceptance = {
            agreementHash: 'pending',
            acceptedPrice: 'as offered',
            acceptedTerms: [],
          };
          const updated = fsm.accept(sessionId, config.agentId, acceptance);
          if (callback) await callback({ text: `Negotiation accepted. Session ${sessionId} is now in state: ${updated.state}.` });
        } else if (isReject) {
          const rejection: NegotiationRejection = { reason: 'Rejected by user instruction' };
          const updated = fsm.reject(sessionId, config.agentId, rejection);
          if (callback) await callback({ text: `Negotiation rejected. Session ${sessionId} is now in state: ${updated.state}.` });
        } else {
          // Counter-offer
          const priceMatch = text.match(/(?:at|for|price|counter)\s+([\d.]+)\s*(\w+)/i);
          const counter: NegotiationCounterOffer = {
            item: session.rounds[0]?.payload && 'item' in session.rounds[0].payload
              ? (session.rounds[0].payload as NegotiationOffer).item
              : 'unknown',
            counterPrice: priceMatch?.[1] ?? '0',
            currency: priceMatch?.[2] ?? 'USDC',
            counterTerms: [],
            deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          };
          const updated = fsm.sendCounter(sessionId, config.agentId, counter);
          if (callback) await callback({ text: `Counter-offer sent at ${counter.counterPrice} ${counter.currency}. Session ${sessionId} state: ${updated.state}.` });
        }
        return;
      }

      // Start new negotiation
      const counterpartyMatch = text.match(/(?:with|agent)\s+([a-zA-Z0-9_-]+)/i);
      const priceMatch = text.match(/(?:at|for|price)\s+([\d.]+)\s*(\w+)/i);
      const itemMatch = text.match(/(?:for|about)\s+(.+?)(?:\s+at\s+|\s*$)/i);

      const counterpartyId = counterpartyMatch?.[1] ?? 'unknown-agent';
      trackKnownAgent(runtime, counterpartyId);

      const session = fsm.createSession({
        myAgentId: config.agentId,
        counterpartyAgentId: counterpartyId,
      });

      const offer: NegotiationOffer = {
        item: itemMatch?.[1] ?? 'service',
        price: priceMatch?.[1] ?? '0',
        currency: priceMatch?.[2] ?? 'USDC',
        terms: [],
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      fsm.sendOffer(session.sessionId, config.agentId, offer);

      if (callback) {
        await callback({
          text: `Negotiation started with ${counterpartyId}.\nSession: ${session.sessionId}\nOffer: ${offer.price} ${offer.currency} for "${offer.item}"`,
        });
      }
    } catch (err) {
      console.error('[AESP] AESP_NEGOTIATE handler error:', err);
      if (callback) await callback({ text: `Negotiation failed due to an internal error. Please try again.` });
    }
  },
};
