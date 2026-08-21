export const AGENT_SCOPES = ['portfolio:read', 'investment_profile:read', 'offline_access'] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export type BrowserAuthorizationInput = {
    clientId: string;
    redirectUri: string;
    state?: string;
    resource: string;
    scopes: AgentScope[];
    codeChallenge: string;
};

export type DeviceAuthorizationInput = {
    clientId: string;
    resource: string;
    scopes: AgentScope[];
};

export type TokenPair = {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    refresh_token?: string;
    scope: string;
};
