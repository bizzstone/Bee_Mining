"use strict";

const { APP_ID, assertSupportedAppId } = require("./appId");

const SET_MINING_KEYS_URL = "https://links.gosh.sh/deeplinks/wallet/v2/set-mining-keys";

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildSetMiningKeysPayload({ appId = APP_ID, publicKey }) {
  assertSupportedAppId(appId);
  if (!publicKey) throw new Error("publicKey is required.");
  return {
    pubkey: publicKey,
    app_id: APP_ID,
  };
}

function buildSetMiningKeysLink({ appId = APP_ID, publicKey, baseUrl = SET_MINING_KEYS_URL }) {
  const payload = buildSetMiningKeysPayload({ appId, publicKey });
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}payload=${base64UrlJson(payload)}`;
}

module.exports = {
  SET_MINING_KEYS_URL,
  buildSetMiningKeysPayload,
  buildSetMiningKeysLink,
};

