import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CALLS_PER_MINUTE,
  MAX_ALLOWED_CALLS_PER_MINUTE,
  RollingWindowRateLimiter,
} from "../scripts/rate-limit.mjs";

test("defaults below ClickUp's 80-call safety ceiling", () => {
  assert.equal(DEFAULT_CALLS_PER_MINUTE, 75);
  assert.equal(MAX_ALLOWED_CALLS_PER_MINUTE, 79);
  assert.throws(
    () => new RollingWindowRateLimiter({ maxCallsPerMinute: 80 }),
    /1 through 79/,
  );
});

test("never starts 80 calls inside a rolling minute", async () => {
  let clock = 0;
  const starts = [];
  const limiter = new RollingWindowRateLimiter({
    maxCallsPerMinute: 79,
    now: () => clock,
    sleep: async (milliseconds) => {
      clock += milliseconds;
    },
  });

  for (let index = 0; index < 240; index += 1) {
    starts.push(await limiter.waitForTurn());
  }

  for (let index = 0; index < starts.length; index += 1) {
    const windowEnd = starts[index] + 60_000;
    const callsInWindow = starts.filter(
      (timestamp) => timestamp >= starts[index] && timestamp < windowEnd,
    ).length;
    assert.ok(callsInWindow <= 79, `observed ${callsInWindow} calls in a minute`);
  }
});
