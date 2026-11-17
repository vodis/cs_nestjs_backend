/**
 * Loopback hosts accepted for native (CLI / desktop) clients per RFC 8252 §7.3.
 * IP literals are preferred; `localhost` is accepted only when the client registered `localhost` itself.
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

export function isLoopbackRedirect(uri: URL): boolean {
    return uri.protocol === 'http:' && LOOPBACK_HOSTS.has(uri.hostname);
}

/** Whether a redirect URI may be registered by a client in its metadata document. */
export function isRegistrableRedirect(value: string): boolean {
    let uri: URL;
    try {
        uri = new URL(value);
    } catch {
        return false;
    }
    if (uri.hash || uri.username || uri.password) return false;
    return uri.protocol === 'https:' || isLoopbackRedirect(uri);
}

/**
 * Exact string match against the registered redirect URIs. For loopback redirects the port is ignored,
 * because native apps bind an ephemeral port at runtime (RFC 8252 §7.3); scheme, host, path and query must
 * still match exactly, and `localhost` never matches an IP literal or vice versa.
 */
export function redirectUriMatches(requested: string, registered: readonly string[]): boolean {
    if (registered.includes(requested)) return isRegistrableRedirect(requested);
    let uri: URL;
    try {
        uri = new URL(requested);
    } catch {
        return false;
    }
    if (!isLoopbackRedirect(uri) || uri.hash || uri.username || uri.password) return false;
    return registered.some((entry) => {
        try {
            const candidate = new URL(entry);
            return (
                isLoopbackRedirect(candidate) &&
                candidate.hostname === uri.hostname &&
                candidate.pathname === uri.pathname &&
                candidate.search === uri.search
            );
        } catch {
            return false;
        }
    });
}
