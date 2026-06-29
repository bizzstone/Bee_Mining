"use strict";

// Use your real app id. This is the app id used by Premium NACKL Miner.
const APP_ID = "0x0000000000000000000000000000000000000000000000000000000000000014";

function assertSupportedAppId(appId) {
  if (appId !== APP_ID) throw new Error("Unexpected APP_ID.");
  return APP_ID;
}

module.exports = {
  APP_ID,
  assertSupportedAppId,
};

