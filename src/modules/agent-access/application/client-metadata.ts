export const CLIENT_METADATA_RESOLVER = Symbol('CLIENT_METADATA_RESOLVER');

/** Metadata published by an OAuth client in its Client ID Metadata Document. */
export type ClientMetadata = {
    clientId: string;
    /** Host of the client_id URL, which the document was fetched from. */
    host: string;
    clientName: string;
    redirectUris: string[];
    clientUri?: string;
    logoUri?: string;
};

/** How the authorization server established the identity shown on the consent screen. */
export type ClientVerification = 'metadata_document' | 'first_party' | 'unverified';

export type ClientMetadataFailure = 'invalid_client_id' | 'unreachable' | 'invalid_document' | 'overloaded';

export class ClientMetadataError extends Error {
    constructor(
        readonly reason: ClientMetadataFailure,
        message: string,
    ) {
        super(message);
        this.name = 'ClientMetadataError';
    }
}

export interface ClientMetadataResolver {
    resolve(clientId: string): Promise<ClientMetadata>;
}
