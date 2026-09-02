import assert from "node:assert/strict";
import test from "node:test";

import { getHealth } from "../src/mcp/health.js";

test("health response identifies an operational Alpha Hunter service", () => {
  assert.deepEqual(getHealth(), {
    status: "ok",
    service: "alpha-hunter",
  });
});
