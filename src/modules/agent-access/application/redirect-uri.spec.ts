import { isRegistrableRedirect, redirectUriMatches } from './redirect-uri';

describe('redirectUriMatches', () => {
    const registered = [
        'https://app.example/callback',
        'http://127.0.0.1/callback',
        'http://[::1]/callback',
        'http://localhost/oauth?mode=cli',
    ];

    it.each([
        'https://app.example/callback',
        'http://127.0.0.1/callback',
        'http://127.0.0.1:53682/callback',
        'http://[::1]:8080/callback',
        'http://localhost:3000/oauth?mode=cli',
    ])('accepts %s', (requested) => {
        expect(redirectUriMatches(requested, registered)).toBe(true);
    });

    it.each([
        'https://app.example/callback/',
        'https://app.example:8443/callback',
        'https://app.example/callback?x=1',
        'http://app.example/callback',
        'http://localhost:3000/callback',
        'http://127.0.0.1:53682/oauth?mode=cli',
        'http://127.0.0.2:53682/callback',
        'https://127.0.0.1:53682/callback',
        'http://127.0.0.1:53682/callback#x',
        'http://user@127.0.0.1:53682/callback',
        'not a url',
    ])('rejects %s', (requested) => {
        expect(redirectUriMatches(requested, registered)).toBe(false);
    });

    it('does not treat localhost and loopback IP literals as interchangeable', () => {
        expect(redirectUriMatches('http://localhost:1234/callback', ['http://127.0.0.1/callback'])).toBe(false);
        expect(redirectUriMatches('http://127.0.0.1:1234/cb', ['http://localhost/cb'])).toBe(false);
    });
});

describe('isRegistrableRedirect', () => {
    it.each(['https://app.example/cb', 'http://127.0.0.1/cb', 'http://[::1]:9000/cb', 'http://localhost/cb'])(
        'allows %s',
        (uri) => expect(isRegistrableRedirect(uri)).toBe(true),
    );

    it.each(['http://app.example/cb', 'javascript:alert(1)', 'https://app.example/cb#frag', 'custom-scheme:/cb'])(
        'refuses %s',
        (uri) => expect(isRegistrableRedirect(uri)).toBe(false),
    );
});
