import { isAxiosError } from 'axios';

type Entry<T> = { promise: Promise<T>; expiresAt: number; pending: boolean };

/** Bounded, display-only history cache. Failed reads never become successful empty data. */
export class MarketHistoryCache<T> {
    private readonly entries = new Map<string, Entry<T>>();
    private readonly failures = new Map<string, { count: number; until: number; error: unknown }>();
    private rateLimitedUntil = 0;

    get(key: string, load: () => Promise<T>, failureKey = key): Promise<T> {
        const now = Date.now();
        const previous = this.entries.get(key);
        if (previous && (previous.pending || previous.expiresAt > now)) return previous.promise;
        const failure = this.failures.get(failureKey);
        if (failure && now < failure.until) return Promise.reject(failure.error);
        if (now < this.rateLimitedUntil) return Promise.reject(new Error('Market history provider is rate limited'));

        const entry: Entry<T> = {
            promise: Promise.resolve().then(load),
            expiresAt: 0,
            pending: true,
        };
        entry.promise = entry.promise.then(
            (value) => {
                entry.pending = false;
                this.failures.delete(failureKey);
                entry.expiresAt = Date.now() + 60_000;
                return value;
            },
            (error: unknown) => {
                entry.pending = false;
                this.entries.delete(key);
                const count = Math.min((this.failures.get(failureKey)?.count || 0) + 1, 5);
                const cooldown = Math.min(30_000 * 2 ** (count - 1), 300_000);
                let until = Date.now() + cooldown;
                if (isAxiosError(error) && error.response?.status === 429) {
                    const retryAfter = error.response.headers?.['retry-after'];
                    const delay = retryAfterMs(retryAfter);
                    this.rateLimitedUntil = Math.max(this.rateLimitedUntil, Date.now() + Math.max(cooldown, delay));
                    until = Math.max(until, this.rateLimitedUntil);
                }
                if (!this.failures.has(failureKey) && this.failures.size >= 256) {
                    this.failures.delete(this.failures.keys().next().value);
                }
                this.failures.set(failureKey, { count, until, error });
                throw error;
            },
        );
        if (!this.entries.has(key) && this.entries.size >= 256) {
            const oldest = [...this.entries].find(([, value]) => !value.pending);
            if (oldest) this.entries.delete(oldest[0]);
        }
        // Do not grow memory without bound when every retained read is in flight.
        if (this.entries.has(key) || this.entries.size < 256) this.entries.set(key, entry);
        return entry.promise;
    }
}

function retryAfterMs(value: unknown): number {
    if (typeof value !== 'string' && typeof value !== 'number') return 0;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 86_400_000);
    const date = Date.parse(String(value));
    return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), 86_400_000) : 0;
}
