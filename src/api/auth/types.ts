export type AuthenticatedUser = {
    id: string;
    privyUserId: string;
    sessionId: string;
    email?: string | null;
    authMethod?: string | null;
    passkeyEnabled: boolean;
};
