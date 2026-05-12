/**
 * Type definitions for extension-sub-agent.
 *
 * Used via JSDoc imports (no TypeScript runtime dependency).
 */

/**
 * @typedef {Object} SubAgentConfig
 * @property {string} apiKey - OpenAI-compatible API key
 * @property {string} model - LLM model identifier
 * @property {string} baseUrl - API base URL
 * @property {number} maxTokens - Max completion tokens per response
 * @property {number} maxTurns - Default max reasoning turns
 * @property {number} temperature - Sampling temperature
 */

/**
 * @typedef {Object} ChatMessage
 * @property {"system"|"user"|"assistant"} role
 * @property {string} content
 */

export {};