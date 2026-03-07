/**
 * @yallet/elizaos-plugin-aesp — Plugin-Specific Types
 */

import type { ChainId } from '@yallet/aesp';

/** Plugin configuration from ElizaOS character settings */
export interface AESPPluginConfig {
  ownerXidentity: string;
  agentId: string;
  defaultChain?: ChainId;
}

/** Transfer intent parsed from natural language */
export interface TransferIntent {
  toAddress: string;
  amount: string;
  token: string;
  chainId: ChainId;
  memo?: string;
}

/** Negotiation intent parsed from natural language */
export interface NegotiationIntent {
  counterpartyAgentId: string;
  item: string;
  price: string;
  currency: string;
  terms: string[];
  action: 'start' | 'counter' | 'accept' | 'reject';
  sessionId?: string;
}

/** Commitment intent parsed from natural language */
export interface CommitmentIntent {
  buyerAgent: string;
  sellerAgent: string;
  item: string;
  price: string;
  currency: string;
  deliveryDeadline: number;
  arbitrator: string;
  escrowRequired: boolean;
  chainId: number;
}
