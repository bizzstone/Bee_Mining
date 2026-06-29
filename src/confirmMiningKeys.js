"use strict";

const { APP_ID, assertSupportedAppId } = require("./appId");
const MINER_ABI = require("./Miner.abi.json");
const { createSdk3TvmClient, loadBeeSdkWasmBytes } = require("./tvmClientBridge");
const { findComparableMapValue, normalizeComparableUint256 } = require("./keyCompare");

const SDK_PACKAGE = "@teamgosh/bee-sdk";
const MOBILE_VERIFIERS_DAPP_ID = "0000000000000000000000000000000000000000000000000000000000000001";

function installBeeSdkNodeBridge(globalScope = globalThis) {
  if (!globalScope || typeof globalScope !== "object") throw new Error("Global runtime object is required.");
  if (typeof globalScope.fetch !== "function") {
    throw new Error("Node 20+ global fetch is required for Bee SDK network calls.");
  }
  if (typeof globalScope.window === "undefined") globalScope.window = globalScope;
  if (typeof globalScope.self === "undefined") globalScope.self = globalScope;
  if (typeof globalScope.Window === "undefined") globalScope.Window = globalScope.constructor || Object;
  if (typeof globalScope.window.fetch !== "function") globalScope.window.fetch = globalScope.fetch;
}

async function loadBeeSdk() {
  installBeeSdkNodeBridge(globalThis);
  const sdk = await import(SDK_PACKAGE);
  if (typeof sdk.initSync === "function") {
    sdk.initSync({ module: loadBeeSdkWasmBytes() });
  }
  return sdk;
}

function graphqlEndpointsFromNetwork(endpoints) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) throw new Error("ACKI endpoint is required.");
  return endpoints
    .map((endpoint) => String(endpoint || "").trim())
    .filter(Boolean)
    .map((endpoint) => (endpoint.endsWith("/graphql") ? endpoint : `${endpoint.replace(/\/$/, "")}/graphql`));
}

function restEndpointFromNetworkEndpoint(endpoint) {
  const value = String(endpoint || "").trim();
  const url = new URL(value);
  if (url.pathname.endsWith("/graphql")) url.pathname = url.pathname.replace(/\/graphql$/, "/");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function accountParts(minerAddress) {
  const value = String(minerAddress || "").trim().toLowerCase();
  const legacy = value.match(/^0:([0-9a-f]{64})$/);
  if (legacy) {
    return {
      accountId: legacy[1],
      dappId: MOBILE_VERIFIERS_DAPP_ID,
      legacyAddress: `0:${legacy[1]}`,
    };
  }
  const extended = value.match(/^([0-9a-f]{64})::([0-9a-f]{64})$/);
  if (extended) {
    return {
      accountId: extended[2],
      dappId: extended[1],
      legacyAddress: `0:${extended[2]}`,
    };
  }
  throw new Error("Unsupported miner address format.");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch (_err) {
    throw new Error(`Non-JSON response from ${url}`);
  }
  if (!response.ok || payload?.error || payload?.errors?.length) {
    const message = payload?.error?.message || payload?.errors?.[0]?.message || response.statusText || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function fetchAccountInfo(endpoint, minerAddress) {
  const parts = accountParts(minerAddress);
  const base = restEndpointFromNetworkEndpoint(endpoint);

  // Current SDK3-friendly REST account read.
  try {
    const query = `account_id=${encodeURIComponent(parts.accountId)}&dapp_id=${encodeURIComponent(parts.dappId)}`;
    const payload = await fetchJson(`${base}/v2/account?${query}`, { method: "GET", headers: { accept: "application/json" } });
    const raw = payload?.result && typeof payload.result === "object" ? payload.result : payload;
    if (raw?.data || raw?.boc) return raw;
  } catch (_err) {
    // Fall through to legacy GraphQL shape.
  }

  const graphql = endpoint.endsWith("/graphql") ? endpoint : `${base}/graphql`;
  const payload = await fetchJson(graphql, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `
        query AccountInfo($address: String!) {
          blockchain {
            account(address: $address) {
              info {
                boc
                data
              }
            }
          }
        }
      `,
      variables: { address: parts.legacyAddress },
    }),
  });
  const info = payload?.data?.blockchain?.account?.info;
  if (!info?.data && !info?.boc) throw new Error("Miner account data not found.");
  return info;
}

async function readMiningKeyBinding({ minerAddress, expectedOwnerPublic, endpoints, appId = APP_ID }) {
  assertSupportedAppId(appId);
  const expected = normalizeComparableUint256(expectedOwnerPublic);
  if (!expected) throw new Error("expectedOwnerPublic is required.");

  const graphqlEndpoints = graphqlEndpointsFromNetwork(endpoints);
  let lastError = "";
  for (const endpoint of graphqlEndpoints) {
    let tvm = null;
    try {
      const account = await fetchAccountInfo(endpoint, minerAddress);
      tvm = await createSdk3TvmClient({ networkEndpoints: graphqlEndpoints });
      let data = account.data || "";
      if (!data && account.boc) data = tvm.parseAccountBoc(account.boc)?.data || "";
      if (!data) throw new Error("Miner account data unavailable.");
      const decoded = tvm.decodeAccountData({ abi: MINER_ABI, data });
      const ownerPublicMap = decoded?._owner_pubkey || decoded?.owner_public || decoded?.ownerPublic || {};
      const match = findComparableMapValue(ownerPublicMap, APP_ID);
      const actual = normalizeComparableUint256(match.value);
      return {
        confirmed: Boolean(actual && actual === expected),
        expectedOwnerPublic: expected,
        actualOwnerPublic: actual,
        matchedAppKey: match.key || "",
      };
    } catch (err) {
      lastError = err?.message || String(err);
    } finally {
      if (typeof tvm?.destroy === "function") tvm.destroy();
    }
  }

  throw new Error(lastError || "Could not read miner account key binding.");
}

async function confirmMiningKeys({ minerAddress, expectedOwnerPublic, endpoints, appId = APP_ID }) {
  assertSupportedAppId(appId);
  const sdk = await loadBeeSdk();

  try {
    await sdk.ensure_mining_keys_propagated({
      client_config: { network: { endpoints: graphqlEndpointsFromNetwork(endpoints) } },
      miner_address: minerAddress,
      app_id: APP_ID,
      expected_owner_public: expectedOwnerPublic,
      max_attempts: 120,
      interval_ms: 2000,
    });
    return { confirmed: true, source: "bee_sdk" };
  } catch (sdkErr) {
    const direct = await readMiningKeyBinding({ minerAddress, expectedOwnerPublic, endpoints, appId });
    if (direct.confirmed) return { confirmed: true, source: "direct_chain_read", direct };

    const err = new Error("Mining keys are still pending or were approved for a different app/public key.");
    err.code = "KEY_CONFIRMATION_PENDING";
    err.sdkError = sdkErr?.message || String(sdkErr || "");
    err.direct = direct;
    throw err;
  }
}

module.exports = {
  confirmMiningKeys,
  installBeeSdkNodeBridge,
  readMiningKeyBinding,
  loadBeeSdk,
};

