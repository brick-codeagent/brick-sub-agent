/**
 * Internal multi-turn agent loop.
 *
 * Runs a self-contained reasoning loop with an LLM:
 * 1. System + User prompt → LLM (initial analysis)
 * 2. Continuation prompt → LLM (refinement/self-critique)
 * 3. ... up to maxTurns
 * 4. Final turn → structured final answer
 */

import { parseConfig } from "./config.js";
import { chat } from "./llm-client.js";

/**
 * System prompt used for all sub-agent runs.
 *
 * @param {number} remainingTurns
 * @returns {string}
 */
function buildSystemPrompt(remainingTurns) {
  return `You are a focused analytical sub-agent. Your job is to think deeply about a specific sub-problem delegated to you by the main coding agent.

Guidelines:
- Think step by step through the problem
- Consider edge cases, tradeoffs, and alternatives
- Be thorough and precise in your analysis
- Structure your response clearly with sections and bullet points
- You have ${remainingTurns} turn(s) remaining to reason about this problem
- In your final turn, produce a comprehensive answer

You do not have access to tools, files, or the internet. All relevant context has been provided in the prompt. Work only with the information given.`;
}

/** Continuation prompt for non-final turns. */
const CONTINUATION_PROMPT =
  "Continue your reasoning. What else should be considered? Refine your analysis, check for edge cases, or elaborate on any aspect that deserves deeper examination.";

/**
 * Run a multi-turn sub-agent reasoning loop.
 *
 * @param {string} prompt - The full context and task for the sub-agent
 * @param {number} [maxTurnsOverride] - Optional override for max turns (1-10)
 * @param {AbortSignal} [signal] - Optional external abort signal
 * @returns {Promise<string>} - The accumulated reasoning trace + final answer
 */
export async function runAgent(prompt, maxTurnsOverride, signal) {
  // 1. Parse and validate config
  const config = parseConfig();

  if (config.error) {
    return `Error: ${config.error}`;
  }

  if (!prompt || prompt.trim().length === 0) {
    return "Error: prompt must be a non-empty string";
  }

  // 2. Determine effective max turns
  let effectiveMaxTurns = config.maxTurns;
  if (maxTurnsOverride !== undefined && maxTurnsOverride !== null) {
    const clamped = Math.max(1, Math.min(10, Number(maxTurnsOverride)));
    if (Number.isNaN(clamped)) {
      process.stderr.write(
        `[sub-agent] Warning: maxTurnsOverride="${maxTurnsOverride}" is not a number, using default ${effectiveMaxTurns}\n`,
      );
    } else {
      effectiveMaxTurns = clamped;
    }
  }

  // 3. Initialize messages
  /** @type {import("./types.js").ChatMessage[]} */
  const messages = [
    { role: "system", content: buildSystemPrompt(effectiveMaxTurns) },
    { role: "user", content: prompt },
  ];

  /** @type {string[]} */
  const reasoningTrace = [];

  // 4. Multi-turn loop
  for (let turn = 1; turn <= effectiveMaxTurns; turn++) {
    const isLastTurn = turn === effectiveMaxTurns;

    try {
      const result = await chat(messages, {
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        signal,
      });

      const responseContent = result.content;

      // Append assistant response to messages
      messages.push({ role: "assistant", content: responseContent });

      // Track reasoning trace
      reasoningTrace.push(
        `--- Turn ${turn}/${effectiveMaxTurns} ---\n${responseContent}`,
      );

      // If not the last turn, append continuation prompt
      if (!isLastTurn) {
        messages.push({ role: "user", content: CONTINUATION_PROMPT });
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : String(err);
      reasoningTrace.push(
        `--- Turn ${turn}/${effectiveMaxTurns} (ERROR) ---\n${errorMsg}`,
      );
      // On error, stop the loop and return what we have
      break;
    }
  }

  // 5. Build final output
  return (
    reasoningTrace.join("\n\n") +
    "\n\n─────────────────────────────────\n## Final Answer\n" +
    extractFinalAnswer(messages)
  );
}

/**
 * Extract the final answer from the last assistant message.
 *
 * @param {import("./types.js").ChatMessage[]} messages
 * @returns {string}
 */
function extractFinalAnswer(messages) {
  // Find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      return messages[i].content;
    }
  }
  return "(no response generated)";
}