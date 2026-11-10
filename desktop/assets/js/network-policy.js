export function isLoopbackHost(hostname) {
  const host = String(hostname).toLowerCase().replace(/\.$/, '');
  return host === 'localhost' || host.endsWith('.localhost') || /^127(?:\.\d{1,3}){3}$/.test(host) || host === '[::1]' || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(host);
}

export function canUseLocalHelper() {
  const loc = globalThis.location;
  return !!loc && (loc.protocol === 'file:' || isLoopbackHost(loc.hostname));
}

// A hosted page must never probe or upload to a visitor's local helper implicitly.
export function fetch(input, options = {}) {
  const { timeoutMs = 60000, ...requestOptions } = options;
  const raw = typeof input === 'string' ? input : input.url;
  const url = new URL(raw, globalThis.location?.href || 'http://localhost/');
  if (isLoopbackHost(url.hostname) && !canUseLocalHelper()) {
    return Promise.reject(new Error('This hosted version cannot contact a local helper. Use its configured server or open the desktop app.'));
  }
  const timeout = AbortSignal.timeout(Math.max(1000, Math.min(300000, timeoutMs)));
  const signal = requestOptions.signal ? AbortSignal.any([requestOptions.signal, timeout]) : timeout;
  return globalThis.fetch(input, { ...requestOptions, signal });
}
