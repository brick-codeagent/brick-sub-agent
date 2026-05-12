/**
 * OpenAI-compatible chat completions client.
 *
 * Uses Node.js built-in fetch() (available in Node 18+).
 * No external SDK dependencies.
 */

/** Timeout for API requests (30 seconds). */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Send a chat completion request to an OpenAI-compatible API.
 *
 * @param {import("./types.js").ChatMessage[]} messages
 * @param {{
 *   model: string,
 *   maxTokens: number,
 *   temperature: number,
 *   baseUrl: string,
 *   apiKey: string,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<{
 *   content: string,
 *   model: string,
 *   usage: { promptTokens: number, completionTokens: number, totalTokens: number }
 * }>}
 */
export async function chat(messages, options) {
  const { model, maxTokens, temperature, baseUrl, apiKey } = options;

  // Create an AbortController for timeout (if no external signal provided)
  const ac = new AbortController();
  const timeoutId = setTimeout(() => {
    ac.abort();
  }, REQUEST_TIMEOUT_MS);

  // Combine our timeout signal with any external signal
  const combinedSignal = options.signal
    ? anySignal([options.signal, ac.signal])
    : ac.signal;

  try {
    const url = `${baseUrl}/chat/completions`;
    const body = JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: combinedSignal,
    });

    if (!response.ok) {
      await handleHttpError(response);
    }

    /** @type {any} */
    const data = await response.json();

    if (
      !data ||
      !data.choices ||
      !Array.isArray(data.choices) ||
      data.choices.length === 0
    ) {
      throw new Error(
        `Invalid API response: missing choices array`,
      );
    }

    const choice = data.choices[0];
    const content = choice.message?.content ?? "";

    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    return {
      content,
      model: data.model ?? model,
      usage,
    };
  } catch (err) {
    // Re-throw with clearer messages for known error types
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        "Request timed out after 30s. The API endpoint may be unreachable.",
      );
    }
    if (err instanceof TypeError) {
      throw new Error(
        `Network error: ${err.message}. Check baseUrl config.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handle non-OK HTTP responses from the API.
 *
 * @param {Response} response
 * @returns {Promise<never>}
 */
async function handleHttpError(response) {
  const status = response.status;
  let message = "";

  try {
    const body = await response.text();
    message = body.slice(0, 500); // Truncate long error messages
  } catch {
    message = response.statusText;
  }

  switch (status) {
    case 401:
      throw new Error(
        `API auth failed (401): check apiKey config. Response: ${message}`,
      );
    case 429:
      throw new Error(
        `Rate limited (429). Response: ${message}`,
      );
    default:
      if (status >= 500) {
        throw new Error(
          `LLM API server error (${status}). Retry later. Response: ${message}`,
        );
      }
      throw new Error(
        `API error (${status}). Response: ${message}`,
      );
  }
}

/**
 * Combine multiple AbortSignals into one.
 * Resolves when any of the signals are aborted.
 *
 * @param {AbortSignal[]} signals
 * @returns {AbortSignal}
 */
function anySignal(signals) {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => {
      controller.abort(signal.reason);
    }, { once: true });
  }

  return controller.signal;
}