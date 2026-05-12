/**
 * Config parser for extension-sub-agent.
 *
 * Reads BRICK_CFG_* environment variables set by Brick's
 * ExtensionConfigManager and returns a validated config object.
 */

/** @typedef {import("../types.js").SubAgentConfig} SubAgentConfig */

const DEFAULTS = {
  model: "gpt-4o",
  baseUrl: "https://api.openai.com/v1",
  maxTokens: 4096,
  maxTurns: 3,
  temperature: 0.7,
};

/**
 * Parse BRICK_CFG_* env vars into a typed config object.
 *
 * @returns {SubAgentConfig & { error?: string }}
 */
export function parseConfig() {
  const apiKey = process.env.BRICK_CFG_APIKEY ?? "";

  if (!apiKey.trim()) {
    return {
      apiKey: "",
      ...DEFAULTS,
      error:
        'API key not configured. Set via: brick config set sub-agent apiKey <key>',
    };
  }

  const model = process.env.BRICK_CFG_MODEL || DEFAULTS.model;
  const baseUrl = (
    process.env.BRICK_CFG_BASEURL || DEFAULTS.baseUrl
  ).replace(/\/+$/, "");
  const maxTokens = parseNumericEnv(
    "BRICK_CFG_MAXTOKENS",
    DEFAULTS.maxTokens,
  );
  const maxTurns = clamp(
    parseNumericEnv("BRICK_CFG_MAXTURNS", DEFAULTS.maxTurns),
    1,
    10,
  );
  const temperature = clamp(
    parseNumericEnv("BRICK_CFG_TEMPERATURE", DEFAULTS.temperature),
    0,
    2,
  );

  return { apiKey, model, baseUrl, maxTokens, maxTurns, temperature };
}

/**
 * Parse a numeric env var, falling back to a default on invalid input.
 *
 * @param {string} envName
 * @param {number} fallback
 * @returns {number}
 */
function parseNumericEnv(envName, fallback) {
  const raw = process.env[envName];
  if (raw === undefined || raw === null || raw === "") return fallback;

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    process.stderr.write(
      `[sub-agent] Warning: ${envName}="${raw}" is not a number, using default ${fallback}\n`,
    );
    return fallback;
  }

  return parsed;
}

/**
 * Clamp a number to [min, max].
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}