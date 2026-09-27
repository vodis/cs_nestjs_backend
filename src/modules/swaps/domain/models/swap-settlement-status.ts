export const ONE_CLICK_TERMINAL_STATUSES = ['INCOMPLETE_DEPOSIT', 'SUCCESS', 'REFUNDED', 'FAILED'] as const;

export type OneClickTerminalStatus = (typeof ONE_CLICK_TERMINAL_STATUSES)[number];
export type OneClickSwapStatus = OneClickTerminalStatus | 'KNOWN_DEPOSIT_TX' | 'PENDING_DEPOSIT' | 'PROCESSING';

export function isOneClickTerminalStatus(status: OneClickSwapStatus): status is OneClickTerminalStatus {
    return ONE_CLICK_TERMINAL_STATUSES.some((terminal) => terminal === status);
}
