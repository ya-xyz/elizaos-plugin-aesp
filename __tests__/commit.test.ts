import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commitPaymentAction } from '../src/actions/commitPayment.js';
import type { Memory, IAgentRuntime } from '@elizaos/core';

vi.mock('../src/init.js', () => {
  const mockBuilder = {
    createCommitment: vi.fn().mockReturnValue({ id: 'commit-123', status: 'draft' }),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const mockReviewMgr = {
    isAgentFrozen: vi.fn().mockReturnValue(false),
    getFreezeStatus: vi.fn().mockReturnValue(undefined),
  };
  return {
    getCommitmentBuilder: () => mockBuilder,
    getReviewManager: () => mockReviewMgr,
    getConfig: () => ({
      ownerXidentity: 'owner-xidentity',
      agentId: 'buyer-agent',
      defaultChain: 'ethereum',
    }),
    trackKnownAgent: vi.fn(),
    __mockBuilder: mockBuilder,
    __mockReviewMgr: mockReviewMgr,
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

describe('AESP_COMMIT_PAYMENT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists commitment after creation', async () => {
    const { __mockBuilder: mockBuilder } = await import('../src/init.js') as any;
    const callback = vi.fn();

    await commitPaymentAction.handler(
      mockRuntime,
      createMessage('Create a commitment to pay agent-seller 200 USDC for API access'),
      undefined,
      undefined,
      callback,
    );

    expect(mockBuilder.createCommitment).toHaveBeenCalled();
    expect(mockBuilder.save).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Commitment created'),
    }));
  });

  it('blocks unauthorized operator', async () => {
    (mockRuntime.getSetting as any).mockImplementation(() => undefined);
    const callback = vi.fn();

    await commitPaymentAction.handler(
      mockRuntime,
      createMessage('Create a commitment to pay agent-seller 200 USDC for API access'),
      undefined,
      undefined,
      callback,
    );

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Unauthorized'),
    }));
  });
});
