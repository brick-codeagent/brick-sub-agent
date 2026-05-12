#!/usr/bin/env node

/**
 * MCP server entry point for extension-sub-agent.
 *
 * JSON-RPC 2.0 over stdio following the MCP protocol:
 *   initialize → tools/list → tools/call → shutdown
 *
 * Graceful shutdown with pending-request tracking.
 */

import { createInterface } from "node:readline";
import { runAgent } from "./lib/agent.js";

// ─── Pending request tracking for graceful shutdown ──────────────────────

/** @type {Set<Promise<unknown>>} */
const pending = new Set();
let rlClosed = false;

/**
 * Track a pending operation for graceful shutdown.
 *
 * @template T
 * @param {Promise<T>} promise
 * @returns {Promise<T>}
 */
function trackPending(promise) {
  pending.add(promise);
  promise.finally(() => pending.delete(promise));
  return promise;
}

// ─── JSON-RPC helpers ────────────────────────────────────────────────────

/**
 * Create a successful JSON-RPC response.
 *
 * @param {string | number} id
 * @param {*} result
 * @returns {string}
 */
function success(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n";
}

/**
 * Create a JSON-RPC error response.
 *
 * @param {string | number} id
 * @param {number} code
 * @param {string} message
 * @returns {string}
 */
function error(id, code, message) {
  return (
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message },
    }) + "\n"
  );
}

// ─── Tool definitions ────────────────────────────────────────────────────

const SUB_AGENT_RUN_TOOL = {
  name: "sub_agent_run",
  description:
    "Spawn a child agent to think deeply about a specific sub-problem. " +
    "You provide full context in the prompt (code, requirements, constraints). " +
    "The agent runs an internal multi-turn reasoning loop and returns its analysis. " +
    "Multiple calls to this tool execute in parallel.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Full context and task for the sub-agent. Include relevant code, " +
          "file contents, error messages, requirements, and any constraints. " +
          "The sub-agent has no external access — everything must be in this prompt.",
      },
      maxTurns: {
        type: "number",
        description:
          "Maximum internal reasoning turns. Overrides the default config value. Min 1, max 10.",
      },
    },
    required: ["prompt"],
  },
};

const TOOLS = [SUB_AGENT_RUN_TOOL];

// ─── Request handler ─────────────────────────────────────────────────────

/**
 * Handle a parsed JSON-RPC request.
 *
 * @param {*} request
 */
async function handleRequest(request) {
  const { id, method, params } = request;

  switch (method) {
    case "initialize": {
      const result = {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "brick-sub-agent",
          version: "0.1.0",
        },
      };
      process.stdout.write(success(id, result));
      break;
    }

    case "tools/list": {
      const result = { tools: TOOLS };
      process.stdout.write(success(id, result));
      break;
    }

    case "tools/call": {
      const toolName = params?.name ?? params?.toolName ?? "";
      const args = params?.arguments ?? {};

      if (toolName !== "sub_agent_run") {
        process.stdout.write(
          error(id, -32601, `Unknown tool: ${toolName}`),
        );
        break;
      }

      const prompt = args.prompt ?? "";
      const maxTurns = args.maxTurns;

      // Run agent in tracked promise
      const agentPromise = runAgent(prompt, maxTurns);
      trackPending(agentPromise);

      try {
        const result = await agentPromise;
        process.stdout.write(
          success(id, { content: [{ type: "text", text: result }] }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(error(id, -32603, msg));
      }
      break;
    }

    case "shutdown": {
      process.stdout.write(success(id, null));
      // Let any pending requests finish
      maybeExit();
      break;
    }

    default: {
      process.stdout.write(
        error(id, -32601, `Method not found: ${method}`),
      );
      break;
    }
  }
}

// ─── Graceful shutdown ───────────────────────────────────────────────────

/**
 * Exit the process if the readline is closed and no requests are pending.
 */
async function maybeExit() {
  if (!rlClosed) return;
  if (pending.size > 0) {
    await Promise.allSettled(Array.from(pending));
  }
  process.exit(0);
}

// ─── Main loop ───────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch {
    // Malformed JSON — ignore silently
    return;
  }

  if (
    !request ||
    typeof request !== "object" ||
    request.jsonrpc !== "2.0"
  ) {
    return;
  }

  trackPending(handleRequest(request));
});

rl.on("close", () => {
  rlClosed = true;
  maybeExit();
});

// Handle signals for graceful shutdown
process.on("SIGTERM", () => {
  rl.close();
});
process.on("SIGINT", () => {
  rl.close();
});