import type { HandlerCallback, IAgentRuntime, Memory } from '@elizaos/core';
import type { ReviewManager } from '@yallet/aesp';

const AUTH_DENY_MESSAGE = 'Unauthorized request. This operation requires an authorized operator.';

function parseCsv(raw: unknown): Set<string> {
  if (typeof raw !== 'string' || raw.trim().length === 0) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function getAuthorizedOperatorIds(runtime: IAgentRuntime): Set<string> {
  const getSetting = runtime.getSetting?.bind(runtime);
  if (!getSetting) return new Set();

  const ownerUserId = getSetting('AESP_OWNER_USER_ID');
  const adminUserIds = parseCsv(getSetting('AESP_ADMIN_USER_IDS'));

  const allowed = new Set<string>(adminUserIds);
  if (typeof ownerUserId === 'string' && ownerUserId.trim().length > 0) {
    allowed.add(ownerUserId.trim());
  }
  return allowed;
}

export async function requireAuthorizedOperator(
  runtime: IAgentRuntime,
  message: Memory,
  callback?: HandlerCallback,
): Promise<boolean> {
  const allowed = getAuthorizedOperatorIds(runtime);
  const requester = String(message.userId ?? '');

  if (allowed.size > 0 && allowed.has(requester)) {
    return true;
  }

  if (callback) {
    await callback({ text: AUTH_DENY_MESSAGE });
  }
  return false;
}

/**
 * Returns true (and sends a callback) if the agent is frozen, blocking the operation.
 * Returns false if the agent is not frozen and the caller may proceed.
 */
export async function guardFrozenAgent(
  reviewMgr: ReviewManager,
  agentId: string,
  actionName: string,
  callback?: HandlerCallback,
): Promise<boolean> {
  if (!reviewMgr.isAgentFrozen(agentId)) return false;

  if (callback) {
    const freeze = reviewMgr.getFreezeStatus(agentId);
    await callback({
      text: `Agent ${agentId} is frozen. ${actionName} blocked. Reason: ${freeze?.reason ?? 'unknown'}`,
      action: actionName,
    });
  }
  return true;
}

