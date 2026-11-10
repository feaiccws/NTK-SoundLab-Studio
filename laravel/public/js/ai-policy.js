// Application-specific free route policy. Model eligibility does not prove account billing state.
export class AiPolicy {
  static models = Object.freeze({
    openrouter: Object.freeze(['openrouter/free']),
    groq: Object.freeze(['whisper-large-v3-turbo', 'whisper-large-v3']),
    gemini: Object.freeze(['gemini-3.5-transcribe', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'])
  });
  static normalize(provider, model) {
    const choices = this.models[provider];
    if (!choices) throw new Error('Unknown AI provider.');
    return choices.includes(model) ? model : choices[0];
  }
  static assertAllowed(provider, model, audio = false) {
    if (!this.models[provider]?.includes(model)) throw new Error('This model is not allowed by Free Only. Choose an approved model in AI Keys.');
    if (audio && provider === 'openrouter') throw new Error('OpenRouter Free is for text tools. Choose Groq Whisper or Google for audio alignment, or use Tap-to-Sync. No audio was uploaded.');
  }
  static async request(url, options = {}, timeoutMs = 120000) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 429) throw new Error('Free quota reached. Wait and retry, or use Tap-to-Sync. No paid fallback was used.');
        if ([401, 403].includes(response.status)) throw new Error('The provider rejected this key or model. Check your free account and key in AI Keys.');
        throw new Error(`AI provider returned HTTP ${response.status}. Your lyrics are unchanged.`);
      }
      if (!data || data.error) throw new Error('The provider returned an invalid response. Your lyrics are unchanged.');
      return data;
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Cancelled. Completed sections are kept.', 'AbortError');
      if (timedOut) throw new Error('AI request timed out. Retry the unfinished section when ready. No paid fallback was used.');
      throw error;
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  }
}
