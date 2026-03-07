# @yallet/elizaos-plugin-aesp

Policy-gated agent economics for [ElizaOS](https://github.com/elizaOS/eliza), powered by [AESP](https://github.com/ya-xyz/aesp) (Agent Economic Sovereignty Protocol).

## What it does

This plugin gives any ElizaOS agent deterministic economic guardrails:

- **8-check policy engine** — per-tx limits, daily/weekly/monthly budgets, address/chain allowlists, time windows, method restrictions, min-balance-after, first-payment review
- **Human-in-the-loop review** — auto / review / biometric escalation tiers
- **Agent-to-agent negotiation** — finite state machine with offer → counter → accept/reject → commit flow
- **EIP-712 commitments** — dual-signed structured agreements between buyer and seller agents
- **Budget tracking** — real-time spending awareness injected into LLM context
- **Emergency freeze** — instantly halt all economic operations for any agent

## Install

```bash
npm install @yallet/elizaos-plugin-aesp @yallet/aesp
```

## Usage

Add to your ElizaOS character config:

```json
{
  "plugins": ["@yallet/elizaos-plugin-aesp"],
  "settings": {
    "AESP_OWNER_XIDENTITY": "<owner-xidentity-public-key>",
    "AESP_AGENT_ID": "<agent-identifier>",
    "AESP_DEFAULT_CHAIN": "ethereum",
    "AESP_OWNER_USER_ID": "<authorized-operator-user-id>",
    "AESP_ADMIN_USER_IDS": "<optional-comma-separated-admin-user-ids>"
  }
}
```

The plugin initializes automatically when registered. No manual setup required:

```typescript
import { aespPlugin } from '@yallet/elizaos-plugin-aesp';

agent.registerPlugin(aespPlugin);
```

## Actions

| Action | Trigger | Description |
|---|---|---|
| `AESP_TRANSFER` | "send 100 USDC to 0x..." | Policy-gated token transfer |
| `AESP_CHECK_BUDGET` | "what's my budget?" | Query remaining budget |
| `AESP_NEGOTIATE` | "negotiate with agent-bob" | Start/continue agent negotiation |
| `AESP_COMMIT_PAYMENT` | "create commitment to pay..." | EIP-712 structured commitment |
| `AESP_FREEZE_AGENT` | "freeze agent-bob" | Emergency freeze/unfreeze |
| `AESP_LIST_AGENTS` | "list all agents" | Show agents with status |

## Providers

- **budgetProvider** — injects remaining budget into LLM context so the agent is aware of its spending limits
- **policyProvider** — injects active policy rules so the agent knows what it can and cannot do

## How policy enforcement works

```
User: "Send 500 USDC to 0xABC..."
         │
         ▼
  ┌─────────────────┐
  │  Parse intent    │
  └────────┬────────┘
           ▼
  ┌─────────────────┐     ┌──────────────┐
  │  PolicyEngine    │────▶│  8 checks:   │
  │  checkAutoApprove│     │  amount, time,│
  └────────┬────────┘     │  address, chain│
           │               │  method, budget│
           │               │  balance, first│
      ┌────┴────┐         └──────────────┘
      │         │
   Approved   Rejected
      │         │
      ▼         ▼
   Execute   ReviewManager
   transfer  → human approval
```

## Development

```bash
npm install
npm run build    # tsup → dist/
npm test         # vitest
npm run dev      # tsup --watch
```

## Paper

> **AESP: A Human-Sovereign Economic Protocol for AI Agents with Privacy-Preserving Settlement**
>
> arXiv: https://arxiv.org/abs/2603.00318

## License

BUSL-1.1 — Licensor: Yeah LLC
