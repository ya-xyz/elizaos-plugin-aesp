import { describe, it, expect, vi } from 'vitest';
import { listAgentsAction } from '../src/actions/listAgents.js';
import type { Memory, IAgentRuntime } from '@elizaos/core';

vi.mock('../src/init.js', () => {
  const mockEngine = {
    getBudgetTracker: () => ({
      getBudget: vi.fn().mockReturnValue(null),
    }),
    getPoliciesForAgent: vi.fn().mockReturnValue([]),
  };
  const mockReviewMgr = {
    getPendingRequests: vi.fn().mockReturnValue([]),
    isAgentFrozen: vi.fn().mockReturnValue(false),
    getFreezeStatus: vi.fn().mockReturnValue(undefined),
  };

  return {
    getEngine: () => mockEngine,
    getReviewManager: () => mockReviewMgr,
    getConfig: () => ({
      ownerXidentity: 'owner-xidentity',
      agentId: 'main-agent',
      defaultChain: 'ethereum',
    }),
    getKnownAgents: () => ['known-agent-a', 'known-agent-b'],
  };
});

function createMessage(text: string): Memory {
  return {
    userId: '00000000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    agentId: '00000000-0000-0000-0000-000000000002' as `${string}-${string}-${string}-${string}-${string}`,
    roomId: '00000000-0000-0000-0000-000000000003' as `${string}-${string}-${string}-${string}-${string}`,
    content: { text },
  };
}

const mockRuntime = {
  getSetting: vi.fn((key: string) => {
    if (key === 'AESP_OWNER_USER_ID') return '00000000-0000-0000-0000-000000000001';
    return undefined;
  }),
} as unknown as IAgentRuntime;

describe('AESP_LIST_AGENTS', () => {
  it('lists known agents even when there are no pending reviews', async () => {
    const callback = vi.fn();

    await listAgentsAction.handler(
      mockRuntime,
      createMessage('List all agents'),
      undefined,
      undefined,
      callback,
    );

    expect(callback).toHaveBeenCalledTimes(1);
    const text = callback.mock.calls[0][0].text;
    expect(text).toContain('known-agent-a');
    expect(text).toContain('known-agent-b');
    expect(text).toContain('main-agent');
  });

  it('blocks unauthorized access', async () => {
    const callback = vi.fn();
    (mockRuntime.getSetting as any).mockImplementation(() => undefined);

    await listAgentsAction.handler(
      mockRuntime,
      createMessage('List all agents'),
      undefined,
      undefined,
      callback,
    );

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Unauthorized'),
    }));
  });
});
