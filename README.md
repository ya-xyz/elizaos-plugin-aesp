# @yault/elizaos-plugin-aesp

[![npm](https://img.shields.io/npm/v/@yault/elizaos-plugin-aesp)](https://www.npmjs.com/package/@yault/elizaos-plugin-aesp)
[![License](https://img.shields.io/npm/l/@yault/elizaos-plugin-aesp)](./LICENSE)

Policy-gated agent economics for [ElizaOS](https://github.com/elizaOS/eliza), powered by [AESP](https://www.npmjs.com/package/@yault/aesp) (Agent Economic Sovereignty Protocol).

Official website: [yault.xyz](https://yault.xyz)

---

## Why This Plugin Exists

Autonomous AI agents increasingly need to manage money — paying for API calls, purchasing data, settling service agreements. But giving an agent unrestricted access to funds is a security risk. Without guardrails, a misbehaving prompt or compromised context could drain a wallet in seconds.

**This plugin solves that problem** by inserting a deterministic policy layer between the agent's intent and the actual execution of economic actions. Every transfer, negotiation, and commitment passes through an 8-check policy engine before anything happens on-chain. Actions that exceed configured limits are automatically escalated to a human-in-the-loop review queue instead of being silently rejected.

The result: agents can operate autonomously within well-defined boundaries, while humans retain ultimate control.

## Core Capabilities

| Capability | Description |
|---|---|
| **8-Check Policy Engine** | Every economic action runs through deterministic checks: agent identity, action type, chain allowlist, address allowlist, per-tx limit, daily/weekly/monthly budgets, and time window. |
| **Human-in-the-Loop Review** | Actions that fail policy checks are routed to a review queue with full context, not silently dropped. |
| **Agent-to-Agent Negotiation** | A finite state machine manages multi-round offer/counter-offer/accept/reject flows between agents. |
| **EIP-712 Commitments** | Structured, dual-signed payment agreements between buyer and seller agents. |
| **Budget Tracking** | Real-time tracking of daily, weekly, and monthly spending against configurable limits. |
| **Emergency Freeze** | Instantly halt all economic operations for any agent, with full audit trail. |
| **LLM Context Injection** | Providers inject budget and policy summaries into the LLM context so the agent makes informed decisions. |
| **Audit Trail** | Every economic action is persisted for compliance and post-hoc analysis. |

## Requirements

- Node.js 18+
- ElizaOS runtime (`@elizaos/core` >= 0.1.0)
- AESP core package (`@yault/aesp` >= 0.1.0)

## Install

```bash
npm install @yault/elizaos-plugin-aesp @yault/aesp
```

For local development alongside the AESP core repo:

```bash
npm install
npm install @yault/aesp@file:../dev.aesp   # optional: link local AESP
npm run build
```

## Quick Start

### 1. Register the plugin

```ts
import { aespPlugin, initAESP } from '@yault/elizaos-plugin-aesp';

// Register with ElizaOS runtime
runtime.registerPlugin(aespPlugin);

// For @elizaos/core 0.1.x: call explicit init before using AESP actions.
// In 0.2.x+, the plugin.init hook is called automatically.
await initAESP(runtime);
```

### 2. Configure character settings

Add these to your ElizaOS character settings or secrets:

| Setting | Required | Description |
|---|---|---|
| `AESP_OWNER_XIDENTITY` | Yes | Owner's xidentity public key (used as commitment arbitrator) |
| `AESP_OWNER_USER_ID` | Yes | ElizaOS user ID authorized to trigger sensitive economic actions |
| `AESP_ADMIN_USER_IDS` | No | Comma-separated additional authorized user IDs |
| `AESP_AGENT_ID` | No | Agent identifier for policy lookup (defaults to `runtime.agentId`) |
| `AESP_DEFAULT_CHAIN` | No | Default chain ID, e.g. `ethereum`, `polygon`, `base` (defaults to `ethereum`) |

### 3. Talk to your agent

The agent now responds to natural language economic commands:

```
"Send 100 USDC to 0xAbC...123 on ethereum"
"What's my remaining budget?"
"Start a negotiation with agent-bob for data access at 50 USDC"
"Create a commitment to pay agent-alice 200 USDC for API access"
"Freeze agent-bob because of suspicious activity"
"List all my agents"
```

---

## Architecture

### Per-Runtime Isolation

Each ElizaOS runtime gets its own isolated set of AESP components, managed via a `WeakMap` keyed by the runtime instance. This ensures multi-agent deployments don't share state:

```
Runtime A ──> PolicyEngine A, ReviewManager A, NegotiationFSM A, ...
Runtime B ──> PolicyEngine B, ReviewManager B, NegotiationFSM B, ...
```

### Two-Tier Storage

The plugin bridges AESP's `StorageAdapter` interface to ElizaOS via `ElizaStorageAdapter`:

- **Tier 1 (hot)**: In-memory `Map` for fast reads within the current session
- **Tier 2 (persistent)**: ElizaOS `cacheManager` for cross-session durability

A key index is maintained so the `keys(prefix)` operation works correctly even for data that has been evicted from the in-memory tier.

### Security Model

All sensitive actions (transfers, negotiations, commitments, freeze/unfreeze, agent listing) require **operator authorization**. The plugin checks `message.userId` against `AESP_OWNER_USER_ID` and `AESP_ADMIN_USER_IDS` before processing. Unauthorized requests are rejected immediately.

Additionally, every action checks the agent's **freeze status** before proceeding. A frozen agent cannot execute any economic operations until explicitly unfrozen by an authorized operator.

```
User Message
  |
  v
Operator Auth Check --> Reject (unauthorized)
  |
  v
Freeze Guard --> Block (agent frozen)
  |
  v
Policy Engine (8 checks) --> Auto-approve OR Human Review Queue
  |
  v
Record Execution / Create Review Request
```

---

## Actions

### AESP_TRANSFER — Policy-Gated Token Transfer

Parses natural language transfer intent, validates it against the 8-check policy engine, and either auto-approves or creates a human review request.

**Triggers**: Messages containing `send`, `transfer`, or `pay` with a blockchain address.

**Flow**:
1. Verify operator authorization
2. Check agent freeze status
3. Parse intent: amount, token, destination address, chain
4. Construct `AgentExecutionRequest` and run `PolicyEngine.checkAutoApprove()`
5. If a matching policy is found: record execution, respond with approval
6. If no policy matches: create a `ReviewRequest` with violation details, respond with review ID

> This plugin records intent and policy decisions. Actual on-chain settlement is handled by a downstream executor (e.g., the Yault vault backend).

### AESP_CHECK_BUDGET — Budget Status Query

Reports current spending against daily, weekly, and monthly limits across all active policies. Does not require operator authorization — any user can query budget status.

**Triggers**: Messages containing `budget`, `spending`, `limit`, `allowance`, or `remaining`.

For each active policy, reports: daily/weekly/monthly spent vs. limit with remaining amounts, plus per-transaction cap.

### AESP_NEGOTIATE — Agent-to-Agent Negotiation

Manages the full lifecycle of a multi-round negotiation between two agents using AESP's `NegotiationStateMachine`.

**Triggers**: Messages containing `negotiate`, `negotiation`, `offer`, `counter-offer`, or `deal`.

**Supported operations**:
- **Start session**: Creates a new negotiation with an initial offer
- **Counter-offer**: References an existing session ID with a revised price
- **Accept**: Finalizes the negotiation
- **Reject**: Terminates the negotiation with a reason

**State machine transitions**: `idle -> offer_sent -> counter_received -> accepted / rejected`

### AESP_COMMIT_PAYMENT — EIP-712 Commitment Creation

Creates a structured payment commitment between a buyer and seller agent. The commitment follows the EIP-712 typed data format for eventual on-chain verification.

**Triggers**: Messages containing `commit`, `commitment`, `escrow`, or `agreement`.

**Fields**: buyer agent, seller agent, item, price, currency, delivery deadline (7 days), arbitrator (owner xidentity), chain ID, escrow flag.

The commitment requires dual signing before it becomes active.

### AESP_FREEZE_AGENT — Emergency Freeze

Immediately blocks all economic operations for a target agent. The freeze is enforced by a guard check at the top of every action handler.

**Triggers**: Messages containing `freeze`, `unfreeze`, `halt`, `emergency stop`, or `block agent`.

- **Freeze**: Records the reason, initiator, and timestamp. All subsequent economic actions are blocked.
- **Unfreeze**: Removes the freeze record, re-enabling economic operations.

### AESP_LIST_AGENTS — Agent Overview

Lists all known agents with their current status, policy count, pending reviews, and spending summary.

**Triggers**: Messages containing `list`/`show`/`all` combined with `agent`/`sub-agent`.

**Data sources**: Known agent IDs (tracked via interactions), the current agent, and agents with pending review requests. For each agent, reports: freeze status, policy count, pending review count, and spending totals.

---

## Providers

Providers inject context into the LLM's prompt on every message, giving the agent awareness of its economic boundaries.

### budgetProvider

Injects a summary of current spending vs. limits. The provider aggregates across all active policies and reports the most restrictive limits. This allows the LLM to proactively avoid proposing transfers that would exceed limits.

### policyProvider

Injects a summary of active policies, including allowed chains, whitelisted addresses, time windows, and per-transaction caps. If the agent is frozen, the provider returns a single freeze warning instead of the policy list.

---

## Evaluator

### AESP_AUDIT

An always-running evaluator that persists the policy engine's state after any economic action. This ensures audit trail continuity across sessions — even if the agent restarts, the full history of policy decisions, executions, and reviews is preserved in the persistent storage tier.

The evaluator triggers on messages that contain AESP action markers or economic action result patterns (transfer approvals, negotiation state changes, freeze events).

---

## Plugin Composition

This plugin uses four core AESP components, each backed by the same `ElizaStorageAdapter`:

| Component | AESP Class | Purpose |
|---|---|---|
| Policy Engine | `PolicyEngine` | 8-check policy evaluation and budget tracking |
| Review Manager | `ReviewManager` | Human-in-the-loop queue and freeze management |
| Negotiation FSM | `NegotiationStateMachine` | Multi-round offer/counter-offer state machine |
| Commitment Builder | `CommitmentBuilder` | EIP-712 typed commitment construction |

All components are loaded from persistent storage on init and saved back after mutations.

---

## Development

```bash
npm install
npm run build        # compile with tsup
npm test             # run vitest
npm run dev          # watch mode
npm run lint         # eslint
```

## Notes

- This plugin performs policy gating and records intent; actual on-chain settlement is handled by downstream executors.
- Enforce strict operator IDs (`AESP_OWNER_USER_ID` / `AESP_ADMIN_USER_IDS`) in production.
- The plugin is compatible with both ElizaOS 0.1.x (manual `initAESP()` call) and 0.2.x+ (automatic `plugin.init` hook).

## Related Packages

- [`@yault/aesp`](https://www.npmjs.com/package/@yault/aesp) — Core AESP SDK (policy engine, negotiation FSM, commitment builder, MCP tools)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting guidelines.

## License

Apache-2.0
