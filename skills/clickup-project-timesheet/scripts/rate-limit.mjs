export const DEFAULT_CALLS_PER_MINUTE = 75;
export const MAX_ALLOWED_CALLS_PER_MINUTE = 79;

const defaultSleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class RollingWindowRateLimiter {
  constructor({
    maxCallsPerMinute = DEFAULT_CALLS_PER_MINUTE,
    windowMs = 60_000,
    now = () => Date.now(),
    sleep = defaultSleep,
  } = {}) {
    if (
      !Number.isInteger(maxCallsPerMinute) ||
      maxCallsPerMinute < 1 ||
      maxCallsPerMinute > MAX_ALLOWED_CALLS_PER_MINUTE
    ) {
      throw new Error(
        `maxCallsPerMinute must be an integer from 1 through ${MAX_ALLOWED_CALLS_PER_MINUTE}.`,
      );
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error("windowMs must be a positive number.");
    }

    this.maxCallsPerMinute = maxCallsPerMinute;
    this.windowMs = windowMs;
    this.minimumIntervalMs = Math.ceil(windowMs / maxCallsPerMinute);
    this.now = now;
    this.sleep = sleep;
    this.startedAt = [];
    this.lastStartedAt = Number.NEGATIVE_INFINITY;
  }

  async waitForTurn() {
    while (true) {
      const current = this.now();
      this.startedAt = this.startedAt.filter(
        (timestamp) => timestamp > current - this.windowMs,
      );

      const intervalWait = Math.max(
        0,
        this.lastStartedAt + this.minimumIntervalMs - current,
      );
      const windowWait =
        this.startedAt.length >= this.maxCallsPerMinute
          ? Math.max(0, this.startedAt[0] + this.windowMs - current + 1)
          : 0;
      const waitMs = Math.max(intervalWait, windowWait);

      if (waitMs > 0) {
        await this.sleep(waitMs);
        continue;
      }

      const started = this.now();
      this.startedAt.push(started);
      this.lastStartedAt = started;
      return started;
    }
  }
}
