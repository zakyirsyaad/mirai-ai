import assert from "node:assert/strict";
import test from "node:test";
import * as serverConfig from "./entitlement-server-config.js";

test("hosted entitlement server binds only to loopback", () => {
  assert.equal(serverConfig.ENTITLEMENT_BIND_HOST, "127.0.0.1");
});
