/**
 * Simple in-memory rate limiter for noteitdown MCP server.
 *
 * Prevents abuse by limiting the number of requests within a time window.
 *
 * Usage:
 *   import { rateLimiter } from "./rateLimiter.js";
 *   rateLimiter.check("global"); // throws if over limit
 */
export class RateLimiter {
  private limits: Map<string, { count: number; resetAt: number }> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if the given key is within the rate limit.
   * Returns true if allowed. Throws if the limit has been exceeded.
   */
  check(key: string): true {
    const now = Date.now();
    const limit = this.limits.get(key);

    if (!limit || now > limit.resetAt) {
      this.limits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (limit.count >= this.maxRequests) {
      throw new Error(
        `Rate limit exceeded. Maximum ${this.maxRequests} requests per ${
          this.windowMs / 1000
        }s. Please try again later.`
      );
    }

    limit.count++;
    return true;
  }

  /** Reset the limit for a given key. */
  reset(key: string): void {
    this.limits.delete(key);
  }

  /** Reset all limits. */
  resetAll(): void {
    this.limits.clear();
  }
}

/** Singleton instance used across the server. */
export const rateLimiter = new RateLimiter(100, 60000);
