"use strict";

const fs = require("fs");
const path = require("path");

const SDK_PACKAGE = "@teamgosh/bee-sdk";

async function importBeeSdkPackage() {
  return import(SDK_PACKAGE);
}

function loadBeeSdkWasmBytes() {
  const packagePath = require.resolve(`${SDK_PACKAGE}/package.json`);
  return fs.readFileSync(path.join(path.dirname(packagePath), "bee_sdk_bg.wasm"));
}

function parseTvmResponse(text, functionName = "unknown") {
  let payload = null;
  try {
    payload = JSON.parse(String(text || ""));
  } catch (err) {
    const wrapped = new Error(`${functionName} returned non-JSON TVM response.`);
    wrapped.code = "TVM_RESPONSE_NON_JSON";
    wrapped.cause = err;
    throw wrapped;
  }
  if (payload?.error) {
    const wrapped = new Error(payload.error.message || `${functionName} failed.`);
    wrapped.code = payload.error.code || "TVM_REQUEST_FAILED";
    wrapped.tvmError = payload.error;
    throw wrapped;
  }
  return payload?.result;
}

function createSdk3TvmRuntime(wasm, networkEndpoints = []) {
  if (!wasm?.tc_create_context || !wasm?.tc_request_sync || !wasm?.tc_read_string) {
    throw new Error("Bee SDK TVM runtime exports are unavailable.");
  }
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function free(ptr, len, align = 1) {
    if (ptr && typeof wasm.__wbindgen_free === "function") wasm.__wbindgen_free(ptr, len, align);
  }

  function allocStringStruct(value) {
    const bytes = encoder.encode(String(value || ""));
    const bytePtr = wasm.__wbindgen_malloc(bytes.length, 1);
    if (bytes.length) new Uint8Array(wasm.memory.buffer, bytePtr, bytes.length).set(bytes);
    const structPtr = wasm.__wbindgen_malloc(8, 4);
    const view = new DataView(wasm.memory.buffer);
    view.setUint32(structPtr, bytePtr, true);
    view.setUint32(structPtr + 4, bytes.length, true);
    return {
      ptr: structPtr,
      cleanup() {
        free(bytePtr, bytes.length, 1);
        free(structPtr, 8, 4);
      },
    };
  }

  function readStringHandle(handle) {
    const out = wasm.__wbindgen_malloc(8, 4);
    try {
      wasm.tc_read_string(out, handle);
      const view = new DataView(wasm.memory.buffer);
      const ptr = view.getUint32(out, true);
      const len = view.getUint32(out + 4, true);
      return decoder.decode(new Uint8Array(wasm.memory.buffer, ptr, len));
    } finally {
      if (typeof wasm.tc_destroy_string === "function") wasm.tc_destroy_string(handle);
      free(out, 8, 4);
    }
  }

  function requestSync(functionName, params = {}) {
    const name = allocStringStruct(functionName);
    const body = allocStringStruct(JSON.stringify(params || {}));
    try {
      const handle = wasm.tc_request_sync(context, name.ptr, body.ptr);
      return parseTvmResponse(readStringHandle(handle), functionName);
    } finally {
      name.cleanup();
      body.cleanup();
    }
  }

  const config = allocStringStruct(JSON.stringify({ network: { endpoints: networkEndpoints } }));
  let context = 0;
  try {
    const handle = wasm.tc_create_context(config.ptr);
    context = Number(parseTvmResponse(readStringHandle(handle), "tc_create_context"));
  } finally {
    config.cleanup();
  }

  return {
    parseAccountBoc(boc) {
      return requestSync("boc.parse_account", { boc })?.parsed || {};
    },
    decodeAccountData({ abi, data }) {
      return requestSync("abi.decode_account_data", {
        abi: { type: "Json", value: JSON.stringify(abi) },
        data,
      })?.data || {};
    },
    destroy() {
      if (context && typeof wasm.tc_destroy_context === "function") wasm.tc_destroy_context(context);
      context = 0;
    },
  };
}

async function createSdk3TvmClient(options = {}) {
  const loadSdk = options.loadSdk || importBeeSdkPackage;
  const loadWasmBytes = options.loadWasmBytes || loadBeeSdkWasmBytes;
  const sdk = options.sdk || await loadSdk();
  if (typeof sdk?.initSync !== "function") throw new Error("Bee SDK initSync is unavailable.");
  const wasm = sdk.initSync({ module: await loadWasmBytes() });
  return createSdk3TvmRuntime(wasm, options.networkEndpoints || []);
}

module.exports = {
  createSdk3TvmClient,
  loadBeeSdkWasmBytes,
};

