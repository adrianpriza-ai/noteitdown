/**
 * Lightweight debug logging for noteitdown.
 *
 * Enable debugging by setting NOTEITDOWN_DEBUG=true in the environment.
 *
 * Usage:
 *   import { debug, log } from "./logger.js";
 *   debug("Fetching note:", id);
 *   log("Server started");
 */
export const DEBUG = process.env.NOTEITDOWN_DEBUG === "true";

export function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.error("[noteitdown:debug]", ...args);
  }
}

export function log(...args: unknown[]): void {
  console.error("[noteitdown]", ...args);
}
