import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import embeddedClientBundleAsset from '../assets/cerbos/embedded-client.bundle.txt';
import embeddedServerWasmAsset from '@cerbos/embedded-server/lib/server.wasm';

type SerializedError = { name: string; message: string; stack?: string };

type RpcRequest =
  | { type: 'rpc'; id: string; method: 'init'; params: CerbosInitParamsPayload }
  | { type: 'rpc'; id: string; method: 'wasmUpload'; params: WasmUploadParams }
  | { type: 'rpc'; id: string; method: 'checkResource'; params: unknown }
  | { type: 'rpc'; id: string; method: 'checkResources'; params: unknown }
  | { type: 'rpc'; id: string; method: 'planResources'; params: unknown };

type RpcResponse =
  | { type: 'ready' }
  | { type: 'rpcResponse'; id: string; ok: true; result: unknown }
  | { type: 'rpcResponse'; id: string; ok: false; error: SerializedError };

type CallbackRequest = {
  type: 'callback';
  id: string;
  callbackId: string;
  payload: unknown;
  expectsResponse?: boolean;
};

type CallbackResponse =
  | { type: 'callbackResponse'; id: string; ok: true; result: unknown }
  | { type: 'callbackResponse'; id: string; ok: false; error: SerializedError };

export type CerbosInitOptions = {
  ruleId: string;
  hubClientId?: string;
  hubClientSecret?: string;
  hubBaseUrl?: string;
  wasmBase64?: string;
};

export type EmbeddedClientOptionsPayload = {
  headers?: Record<string, string> | [string, string][];
  userAgent?: string;
  defaultPolicyVersion?: string;
  globals?: Record<string, unknown>;
  lenientScopeSearch?: boolean;
  schemaEnforcement?: 'none' | 'warn' | 'reject';
  onValidationError?: 'throw' | 'callback' | 'return';
};

export type PolicyOptionsPayload = {
  scopes?: string[];
  activateOnLoad?: boolean;
  interval?: number;
};

export type CerbosCallbacks = {
  onDecision?: (entry: unknown) => void | Promise<void>;
  onValidationError?: (validationErrors: unknown) => void | Promise<void>;
  decodeJWTPayload?: (jwt: unknown) => Promise<Record<string, unknown>>;
  onPolicyUpdate?: (error: unknown) => void | Promise<void>;
};

type CallbackIdsPayload = {
  onDecision?: string;
  onValidationError?: string;
  decodeJWTPayload?: string;
  onPolicyUpdate?: string;
};

type CerbosInitParamsPayload = CerbosInitOptions & {
  options?: EmbeddedClientOptionsPayload;
  policyOptions?: PolicyOptionsPayload;
  callbackIds?: CallbackIdsPayload;
};

type WasmUploadParams = {
  uploadId: string;
  index: number;
  total: number;
  chunk: string;
};

export type CerbosWebViewHandle = {
  isReady: () => boolean;
  init: (
    params: CerbosInitOptions & {
      options?: EmbeddedClientOptionsPayload;
      policyOptions?: PolicyOptionsPayload;
      callbacks?: CerbosCallbacks;
    },
  ) => Promise<void>;
  checkResource: (request: unknown) => Promise<unknown>;
  checkResources: (request: unknown) => Promise<unknown>;
  planResources: (request: unknown) => Promise<unknown>;
};

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readAssetString(moduleId: number, encoding?: FileSystem.EncodingType) {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return await FileSystem.readAsStringAsync(uri, encoding ? { encoding } : undefined);
}

function getLoadingHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cerbos Embedded Runtime</title>
    <style>
      html, body { margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }
      body { padding: 10px; }
      .muted { color: #666; font-size: 12px; }
    </style>
  </head>
  <body>
    <div>Cerbos Embedded Runtime</div>
    <div class="muted">Loading bundled assets…</div>
  </body>
</html>`;
}

function getErrorHtml(errorMessage: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cerbos Embedded Runtime</title>
    <style>
      html, body { margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }
      body { padding: 10px; }
      .muted { color: #666; font-size: 12px; }
      pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; }
    </style>
  </head>
  <body>
    <div>Cerbos Embedded Runtime</div>
    <div class="muted">Failed to load bundled assets.</div>
    <pre id="error"></pre>
    <script>
      document.getElementById("error").textContent = ${JSON.stringify(errorMessage)};

      function post(msg) {
        try {
          window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
        } catch (e) {
          // ignore
        }
      }

      function receive(event) {
        const data = event?.data;
        if (typeof data !== "string") return;
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        if (!msg || msg.type !== "rpc") return;
        post({
          type: "rpcResponse",
          id: msg.id,
          ok: false,
          error: { name: "Error", message: ${JSON.stringify(errorMessage)} },
        });
      }

      document.addEventListener("message", receive);
      window.addEventListener("message", receive);

      post({ type: "ready" });
    </script>
  </body>
</html>`;
}

function getBridgeHtml({ embeddedClientBundle }: { embeddedClientBundle?: string | null }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cerbos Embedded Runtime</title>
    <style>
      html, body { margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }
      body { padding: 10px; }
      .muted { color: #666; font-size: 12px; }
    </style>
  </head>
  <body>
    <div>Cerbos Embedded Runtime</div>
    <div class="muted" id="status">Loading…</div>
    ${embeddedClientBundle ? `<script>(0,eval)(${JSON.stringify(embeddedClientBundle)});</script>` : ''}
    <script>
      const statusEl = document.getElementById("status");

      function setStatus(text) {
        if (statusEl) statusEl.textContent = text;
      }

      function post(msg) {
        try {
          window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
        } catch (e) {
          // ignore
        }
      }

      function serializeError(err) {
        const e = err ?? {};
        return {
          name: String(e.name ?? "Error"),
          message: String(e.message ?? e),
          stack: typeof e.stack === "string" ? e.stack : undefined,
        };
      }

      function decodeBase64ToUint8Array(base64) {
        const raw = atob(base64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return bytes;
      }

      let bundledWasmBase64 = null;
      const wasmUploads = new Map();

      let Embedded = null;
      let cerbos = null;

      const callbackWaiters = new Map();

      function postCallbackRequest(callbackId, payload, expectsResponse) {
        const id = String(Date.now()) + "-" + Math.random().toString(16).slice(2);
        post({ type: "callback", id, callbackId, payload, expectsResponse });
        return id;
      }

      function callNativeCallback(callbackId, payload) {
        const id = postCallbackRequest(callbackId, payload, true);
        return new Promise((resolve, reject) => {
          callbackWaiters.set(id, { resolve, reject });
          setTimeout(() => {
            if (!callbackWaiters.has(id)) return;
            callbackWaiters.delete(id);
            reject(new Error("Native callback timed out"));
          }, 30000);
        });
      }

      async function loadSdk() {
        if (Embedded) return;
        setStatus("Loading SDK…");
        if (!globalThis.__cerbosEmbedded?.Embedded) {
          throw new Error("Missing bundled @cerbos/embedded-client. Ensure assets/cerbos/embedded-client.bundle.txt exists and is up to date.");
        }
        Embedded = globalThis.__cerbosEmbedded.Embedded;
        setStatus("SDK loaded.");
      }

      async function initClient(params) {
        await loadSdk();

        const wasmBase64 = params.wasmBase64 || bundledWasmBase64;
        const wasm = wasmBase64
          ? decodeBase64ToUint8Array(wasmBase64)
          : (() => { throw new Error("Missing WASM. Ensure the app uploads the bundled @cerbos/embedded-server WASM before calling init."); })();

        const { ruleId, hubClientId, hubClientSecret, hubBaseUrl } = params;
        const policyOptions = params.policyOptions || {};
        const callbackIds = params.callbackIds || {};

        const basePolicies = hubClientId && hubClientSecret
          ? { ruleId, credentials: { clientId: hubClientId, clientSecret: hubClientSecret }, ...(hubBaseUrl ? { baseUrl: hubBaseUrl } : {}) }
          : { ruleId, ...(hubBaseUrl ? { baseUrl: hubBaseUrl } : {}) };

        const policies = {
          ...basePolicies,
          ...(Array.isArray(policyOptions.scopes) ? { scopes: policyOptions.scopes } : {}),
          ...(typeof policyOptions.activateOnLoad === "boolean" ? { activateOnLoad: policyOptions.activateOnLoad } : {}),
          ...(typeof policyOptions.interval === "number" ? { interval: policyOptions.interval } : {}),
          ...(callbackIds.onPolicyUpdate
            ? { onUpdate: (error) => { postCallbackRequest(callbackIds.onPolicyUpdate, error, false); } }
            : {}),
        };

        const options = params.options || {};

        const decodeJWTPayload = callbackIds.decodeJWTPayload
          ? async (jwt) => await callNativeCallback(callbackIds.decodeJWTPayload, jwt)
          : undefined;

        const onDecision = callbackIds.onDecision
          ? async (entry) => { postCallbackRequest(callbackIds.onDecision, entry, false); }
          : undefined;

        const onValidationError =
          options.onValidationError === "throw"
            ? "throw"
            : options.onValidationError === "callback" && callbackIds.onValidationError
              ? (errors) => { postCallbackRequest(callbackIds.onValidationError, errors, false); }
              : undefined;

        setStatus("Initializing embedded client…");
        cerbos = new Embedded({
          policies,
          wasm,
          ...(options.headers ? { headers: options.headers } : {}),
          ...(options.userAgent ? { userAgent: options.userAgent } : {}),
          ...(options.defaultPolicyVersion ? { defaultPolicyVersion: options.defaultPolicyVersion } : {}),
          ...(options.globals ? { globals: options.globals } : {}),
          ...(typeof options.lenientScopeSearch === "boolean" ? { lenientScopeSearch: options.lenientScopeSearch } : {}),
          ...(options.schemaEnforcement ? { schemaEnforcement: options.schemaEnforcement } : {}),
          ...(decodeJWTPayload ? { decodeJWTPayload } : {}),
          ...(onDecision ? { onDecision } : {}),
          ...(onValidationError ? { onValidationError } : {}),
        });
        setStatus("Client initialized.");
      }

      async function checkResource(request) {
        if (!cerbos) throw new Error("Cerbos client not initialized. Call init first.");
        const result = await cerbos.checkResource(request);
        return {
          resource: result.resource,
          actions: result.actions,
          allAllowed: result.allAllowed(),
          allowedActions: result.allowedActions(),
          validationErrors: result.validationErrors,
          metadata: result.metadata,
          outputs: result.outputs,
        };
      }

      async function checkResources(request) {
        if (!cerbos) throw new Error("Cerbos client not initialized. Call init first.");
        const response = await cerbos.checkResources(request);
        return {
          cerbosCallId: response.cerbosCallId,
          requestId: response.requestId,
          results: response.results.map((result) => ({
            resource: result.resource,
            actions: result.actions,
            allAllowed: result.allAllowed(),
            allowedActions: result.allowedActions(),
            validationErrors: result.validationErrors,
            metadata: result.metadata,
            outputs: result.outputs,
          })),
          validationErrors: response.validationErrors,
        };
      }

      async function planResources(request) {
        if (!cerbos) throw new Error("Cerbos client not initialized. Call init first.");
        const response = await cerbos.planResources(request);
        return response;
      }

      async function wasmUpload(params) {
        const { uploadId, index, total, chunk } = params || {};
        if (!uploadId || typeof index !== "number" || typeof total !== "number" || typeof chunk !== "string") {
          throw new Error("Invalid wasmUpload params");
        }

        let upload = wasmUploads.get(uploadId);
        if (!upload) {
          upload = { total, chunks: new Array(total).fill(""), received: 0 };
          wasmUploads.set(uploadId, upload);
        }

        if (upload.total !== total) {
          throw new Error("Mismatched upload total");
        }

        if (!upload.chunks[index]) {
          upload.received++;
        }
        upload.chunks[index] = chunk;

        if (upload.received >= upload.total) {
          bundledWasmBase64 = upload.chunks.join("");
          wasmUploads.delete(uploadId);
          return { done: true };
        }

        return { done: false, received: upload.received, total: upload.total };
      }

      const handlers = { init: initClient, checkResource, checkResources, planResources, wasmUpload };

      async function handleRpc(msg) {
        const { id, method, params } = msg;
        try {
          if (!handlers[method]) throw new Error(\`Unknown method: \${method}\`);
          const result = await handlers[method](params);
          post({ type: "rpcResponse", id, ok: true, result });
        } catch (err) {
          post({ type: "rpcResponse", id, ok: false, error: serializeError(err) });
        }
      }

      function receive(event) {
        const data = event?.data;
        if (typeof data !== "string") return;
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        if (!msg || (msg.type !== "rpc" && msg.type !== "callbackResponse")) return;
        if (msg.type === "rpc") {
          handleRpc(msg);
          return;
        }

        const waiter = callbackWaiters.get(msg.id);
        if (!waiter) return;
        callbackWaiters.delete(msg.id);
        if (msg.ok) waiter.resolve(msg.result);
        else waiter.reject(new Error(msg.error?.message || "Native callback failed"));
      }

      // Android uses document, iOS uses window.
      document.addEventListener("message", receive);
      window.addEventListener("message", receive);

      setStatus("Bridge ready.");
      post({ type: "ready" });
    </script>
  </body>
</html>`;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export const CerbosEmbeddedWebView = forwardRef<
  CerbosWebViewHandle,
  { style?: StyleProp<ViewStyle> }
>(({ style }, ref) => {
  const webViewRef = useRef<WebView>(null);
  const pendingRef = useRef(new Map<string, Pending>());
  const callbacksRef = useRef(new Map<string, CerbosCallbacks[keyof CerbosCallbacks]>());
  const readyResolversRef = useRef<(() => void)[]>([]);
  const [isReady, setIsReady] = useState(false);

  const [html, setHtml] = useState(() => getLoadingHtml());
  const wasmBase64Ref = useRef<string | null>(null);
  const wasmBase64PromiseRef = useRef<Promise<string | null> | null>(null);
  const wasmUploadedRef = useRef(false);
  const wasmUploadPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (Platform.OS === 'web') return;
      try {
        const embeddedClientBundle = await readAssetString(embeddedClientBundleAsset);
        if (!cancelled) {
          setIsReady(false);
          readyResolversRef.current = [];

          for (const pending of pendingRef.current.values()) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('WebView reloaded'));
          }
          pendingRef.current.clear();

          setHtml(getBridgeHtml({ embeddedClientBundle }));
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) setHtml(getErrorHtml(message));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const resolveReady = useCallback(() => {
    setIsReady(true);
    for (const resolve of readyResolversRef.current) resolve();
    readyResolversRef.current = [];
  }, []);

  const awaitReady = useCallback(() => {
    if (isReady) return Promise.resolve();
    return new Promise<void>((resolve) => {
      readyResolversRef.current.push(resolve);
    });
  }, [isReady]);

  const postRpc = useCallback(
    async (message: RpcRequest, timeoutMs = 30_000) => {
      await awaitReady();

      return await new Promise<unknown>((resolve, reject) => {
        const id = message.id;

        const timeout = setTimeout(() => {
          pendingRef.current.delete(id);
          reject(new Error(`WebView RPC timed out after ${timeoutMs}ms (${message.method})`));
        }, timeoutMs);

        pendingRef.current.set(id, { resolve, reject, timeout });
        webViewRef.current?.postMessage(JSON.stringify(message));
      });
    },
    [awaitReady],
  );

  const getBundledWasmBase64 = useCallback(async () => {
    if (Platform.OS === 'web') return null;

    if (wasmBase64Ref.current) return wasmBase64Ref.current;
    wasmBase64PromiseRef.current ??= (async () => {
      try {
        const wasmBase64 = await readAssetString(embeddedServerWasmAsset, FileSystem.EncodingType.Base64);
        wasmBase64Ref.current = wasmBase64;
        return wasmBase64;
      } catch {
        return null;
      }
    })();

    return await wasmBase64PromiseRef.current;
  }, []);

  const ensureBundledWasmUploaded = useCallback(async () => {
    if (Platform.OS === 'web') return;
    if (wasmUploadedRef.current) return;

    wasmUploadPromiseRef.current ??= (async () => {
      const wasmBase64 = await getBundledWasmBase64();
      if (!wasmBase64) return;

      const chunkSize = 256 * 1024;
      const total = Math.ceil(wasmBase64.length / chunkSize);
      const uploadId = createRequestId();

      for (let index = 0; index < total; index++) {
        const chunk = wasmBase64.slice(
          index * chunkSize,
          Math.min((index + 1) * chunkSize, wasmBase64.length),
        );
        const message: RpcRequest = {
          type: 'rpc',
          id: createRequestId(),
          method: 'wasmUpload',
          params: { uploadId, index, total, chunk },
        };
        await postRpc(message, 120_000);
      }

      wasmUploadedRef.current = true;
      wasmBase64Ref.current = null;
      wasmBase64PromiseRef.current = null;
    })();

    await wasmUploadPromiseRef.current;
  }, [getBundledWasmBase64, postRpc]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const text = event.nativeEvent.data;
      let msg: RpcResponse | CallbackRequest | undefined;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }

      if (!msg) return;
      if (msg.type === 'ready') {
        resolveReady();
        return;
      }

      if (msg.type === 'callback') {
        const handler = callbacksRef.current.get(msg.callbackId);
        if (!handler) {
          const response: CallbackResponse = {
            type: 'callbackResponse',
            id: msg.id,
            ok: false,
            error: { name: 'Error', message: `Unknown callbackId: ${msg.callbackId}` },
          };
          webViewRef.current?.postMessage(JSON.stringify(response));
          return;
        }

        void Promise.resolve()
          .then(async () => {
            const result = await (handler as (payload: unknown) => unknown)(msg.payload);
            if (!msg.expectsResponse) return;
            const response: CallbackResponse = { type: 'callbackResponse', id: msg.id, ok: true, result };
            webViewRef.current?.postMessage(JSON.stringify(response));
          })
          .catch((e) => {
            if (!msg.expectsResponse) return;
            const message = e instanceof Error ? e.message : String(e);
            const response: CallbackResponse = {
              type: 'callbackResponse',
              id: msg.id,
              ok: false,
              error: { name: e instanceof Error ? e.name : 'Error', message },
            };
            webViewRef.current?.postMessage(JSON.stringify(response));
          });

        return;
      }

      if (msg.type !== 'rpcResponse') return;

      const pending = pendingRef.current.get(msg.id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      pendingRef.current.delete(msg.id);

      if (msg.ok) {
        pending.resolve(msg.result);
      } else {
        const e = msg.error;
        const err = new Error(e?.message ?? 'WebView RPC error');
        err.name = e?.name ?? 'Error';
        if (e?.stack) (err as Error & { stack?: string }).stack = e.stack;
        pending.reject(err);
      }
    },
    [resolveReady],
  );

  useImperativeHandle(
    ref,
    () => ({
      isReady: () => isReady,
      init: async (params) => {
        const callbackIds: CallbackIdsPayload = {};
        if (params.callbacks?.onDecision) {
          const id = createRequestId();
          callbacksRef.current.set(id, params.callbacks.onDecision);
          callbackIds.onDecision = id;
        }
        if (params.callbacks?.onValidationError) {
          const id = createRequestId();
          callbacksRef.current.set(id, params.callbacks.onValidationError);
          callbackIds.onValidationError = id;
        }
        if (params.callbacks?.decodeJWTPayload) {
          const id = createRequestId();
          callbacksRef.current.set(id, params.callbacks.decodeJWTPayload);
          callbackIds.decodeJWTPayload = id;
        }
        if (params.callbacks?.onPolicyUpdate) {
          const id = createRequestId();
          callbacksRef.current.set(id, params.callbacks.onPolicyUpdate);
          callbackIds.onPolicyUpdate = id;
        }

        if (!params.wasmBase64) {
          await ensureBundledWasmUploaded();
        }

        const payload: CerbosInitParamsPayload = {
          ruleId: params.ruleId,
          hubClientId: params.hubClientId,
          hubClientSecret: params.hubClientSecret,
          hubBaseUrl: params.hubBaseUrl,
          wasmBase64: params.wasmBase64,
          options: params.options,
          policyOptions: params.policyOptions,
          callbackIds,
        };

        const message: RpcRequest = {
          type: 'rpc',
          id: createRequestId(),
          method: 'init',
          params: payload,
        };
        await postRpc(message);
      },
      checkResource: async (request: unknown) => {
        const message: RpcRequest = {
          type: 'rpc',
          id: createRequestId(),
          method: 'checkResource',
          params: request,
        };
        return await postRpc(message);
      },
      checkResources: async (request: unknown) => {
        const message: RpcRequest = {
          type: 'rpc',
          id: createRequestId(),
          method: 'checkResources',
          params: request,
        };
        return await postRpc(message);
      },
      planResources: async (request: unknown) => {
        const message: RpcRequest = {
          type: 'rpc',
          id: createRequestId(),
          method: 'planResources',
          params: request,
        };
        return await postRpc(message);
      },
    }),
    [ensureBundledWasmUploaded, isReady, postRpc],
  );

  return (
    <WebView
      ref={webViewRef}
      style={style}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      source={{ html }}
      onMessage={onMessage}
    />
  );
});

CerbosEmbeddedWebView.displayName = 'CerbosEmbeddedWebView';
