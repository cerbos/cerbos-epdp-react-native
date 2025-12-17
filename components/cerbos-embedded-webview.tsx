import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

type SerializedError = { name: string; message: string; stack?: string };

type RpcRequest =
  | { type: 'rpc'; id: string; method: 'init'; params: CerbosInitOptions }
  | { type: 'rpc'; id: string; method: 'checkResource'; params: unknown };

type RpcResponse =
  | { type: 'ready' }
  | { type: 'rpcResponse'; id: string; ok: true; result: unknown }
  | { type: 'rpcResponse'; id: string; ok: false; error: SerializedError };

export type CerbosInitOptions = {
  ruleId: string;
  hubClientId?: string;
  hubClientSecret?: string;
  hubBaseUrl?: string;
  wasmUrl?: string;
};

export type CerbosWebViewHandle = {
  isReady: () => boolean;
  init: (options: CerbosInitOptions) => Promise<void>;
  checkResource: (request: unknown) => Promise<unknown>;
};

export function defaultWasmUrl() {
  return 'https://unpkg.com/@cerbos/embedded-server@0.2.0/lib/server.wasm';
}

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getBridgeHtml() {
  const embeddedClientUrl =
    'https://esm.sh/@cerbos/embedded-client@0.2.0?bundle&target=es2020';

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
    <script type="module">
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

      async function fetchWasmBytes(wasmUrl) {
        const res = await fetch(wasmUrl);
        if (!res.ok) throw new Error(\`Failed to fetch WASM (\${res.status}) from \${wasmUrl}\`);
        const buf = await res.arrayBuffer();
        return new Uint8Array(buf);
      }

      let Embedded = null;
      let cerbos = null;

      async function loadSdk() {
        if (Embedded) return;
        setStatus("Loading SDK…");
        const mod = await import("${embeddedClientUrl}");
        Embedded = mod.Embedded;
        setStatus("SDK loaded.");
      }

      async function initClient(params) {
        await loadSdk();

        const wasmUrl = params.wasmUrl || "${defaultWasmUrl()}";
        const wasm = params.wasmBase64
          ? decodeBase64ToUint8Array(params.wasmBase64)
          : await fetchWasmBytes(wasmUrl);

        const { ruleId, hubClientId, hubClientSecret, hubBaseUrl } = params;
        const policies = hubClientId && hubClientSecret
          ? { ruleId, credentials: { clientId: hubClientId, clientSecret: hubClientSecret }, ...(hubBaseUrl ? { baseUrl: hubBaseUrl } : {}) }
          : { ruleId, ...(hubBaseUrl ? { baseUrl: hubBaseUrl } : {}) };

        setStatus("Initializing embedded client…");
        cerbos = new Embedded({ policies, wasm });
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

      const handlers = { init: initClient, checkResource };

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
        if (!msg || msg.type !== "rpc") return;
        handleRpc(msg);
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
  const readyResolversRef = useRef<(() => void)[]>([]);
  const [isReady, setIsReady] = useState(false);

  const html = useMemo(() => getBridgeHtml(), []);

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

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const text = event.nativeEvent.data;
      let msg: RpcResponse | undefined;
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
      init: async (options: CerbosInitOptions) => {
        const message: RpcRequest = { type: 'rpc', id: createRequestId(), method: 'init', params: options };
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
    }),
    [isReady, postRpc],
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
