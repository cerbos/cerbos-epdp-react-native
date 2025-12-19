import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import bridgeHtmlAsset from '../assets/cerbos/bridge.html';
import bridgeBundleAsset from '../assets/cerbos/bridge.bundle';
import embeddedServerWasmAsset from '@cerbos/embedded-server/lib/server.wasm';
import type { CheckResourceRequest, CheckResourcesRequest, PlanResourcesRequest } from '@cerbos/core';

import type {
  CallbackIdsPayload,
  CallbackRequest,
  CallbackResponse,
  CerbosCallbacks,
  CerbosInitParamsPayload,
  CerbosWebViewHandle,
  RpcRequest,
  RpcResponse,
} from './cerbos-embedded-bridge-types';
export type { CerbosCallbacks, CerbosInitOptions, CerbosWebViewHandle } from './cerbos-embedded-bridge-types';

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readAssetString(moduleId: number, encoding?: FileSystem.EncodingType) {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return await FileSystem.readAsStringAsync(uri, encoding ? { encoding } : undefined);
}

async function stageBridgeAssets() {
  const htmlAsset = Asset.fromModule(bridgeHtmlAsset);
  const bundleAsset = Asset.fromModule(bridgeBundleAsset);
  await Promise.all([htmlAsset.downloadAsync(), bundleAsset.downloadAsync()]);

  const htmlUri = htmlAsset.localUri ?? htmlAsset.uri;
  const bundleUri = bundleAsset.localUri ?? bundleAsset.uri;

  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDir) {
    throw new Error('Missing cache directory for WebView assets');
  }

  const hasStableHash = Boolean(htmlAsset.hash && bundleAsset.hash);
  const hashSuffix = [htmlAsset.hash, bundleAsset.hash].filter(Boolean).join('-') || 'current';
  const targetDir = `${baseDir}cerbos-webview/${hashSuffix}/`;
  await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });

  const htmlTarget = `${targetDir}bridge.html`;
  const bundleTarget = `${targetDir}bridge.bundle`;
  const [htmlInfo, bundleInfo] = await Promise.all([
    FileSystem.getInfoAsync(htmlTarget),
    FileSystem.getInfoAsync(bundleTarget),
  ]);

  if (!htmlInfo.exists || !hasStableHash) {
    await FileSystem.copyAsync({ from: htmlUri, to: htmlTarget });
  }
  if (!bundleInfo.exists || !hasStableHash) {
    await FileSystem.copyAsync({ from: bundleUri, to: bundleTarget });
  }

  return { htmlUri: htmlTarget, readAccessUri: targetDir };
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

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type ReadyWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
};

const RPC_TIMEOUT_MS = 30_000;
const WASM_UPLOAD_TIMEOUT_MS = 120_000;
const WASM_UPLOAD_CHUNK_SIZE = 256 * 1024;

export const CerbosEmbeddedWebView = forwardRef<
  CerbosWebViewHandle,
  { style?: StyleProp<ViewStyle>; containerStyle?: StyleProp<ViewStyle> }
>(({ style, containerStyle }, ref) => {
  const webViewRef = useRef<WebView>(null);
  const pendingRef = useRef(new Map<string, Pending>());
  const callbacksRef = useRef(new Map<string, CerbosCallbacks[keyof CerbosCallbacks]>());
  const readyWaitersRef = useRef<ReadyWaiter[]>([]);
  const [isReady, setIsReady] = useState(false);

  const [source, setSource] = useState<NonNullable<WebViewProps['source']>>(() => ({ html: getLoadingHtml() }));
  const [bridgeReadAccessUri, setBridgeReadAccessUri] = useState<string | null>(null);
  const wasmBase64Ref = useRef<string | null>(null);
  const wasmBase64PromiseRef = useRef<Promise<string | null> | null>(null);
  const wasmUploadedRef = useRef(false);
  const wasmUploadPromiseRef = useRef<Promise<void> | null>(null);

  const resetPendingRequests = useCallback((reason: string) => {
    const error = new Error(reason);
    for (const pending of pendingRef.current.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    pendingRef.current.clear();
  }, []);

  const rejectReadyWaiters = useCallback((reason: string) => {
    const error = new Error(reason);
    for (const waiter of readyWaitersRef.current) waiter.reject(error);
    readyWaitersRef.current = [];
  }, []);

  const resetReadyState = useCallback(
    (reason: string) => {
      setIsReady(false);
      rejectReadyWaiters(reason);
      resetPendingRequests(reason);
    },
    [rejectReadyWaiters, resetPendingRequests],
  );

  const handleWebViewReload = useCallback(
    (reason = 'WebView reloaded') => {
      resetReadyState(reason);
      wasmUploadedRef.current = false;
      wasmUploadPromiseRef.current = null;
    },
    [resetReadyState],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (Platform.OS === 'web') {
        if (!cancelled) {
          handleWebViewReload('WebView not available on web');
          setBridgeReadAccessUri(null);
          setSource({ html: getErrorHtml('This demo does not support web (local WebView assets are required).') });
        }
        return;
      }
      try {
        const { htmlUri, readAccessUri } = await stageBridgeAssets();
        if (!cancelled) {
          handleWebViewReload('WebView reloaded');
          setBridgeReadAccessUri(readAccessUri);
          setSource({ uri: htmlUri });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) {
          handleWebViewReload('WebView failed to load');
          setBridgeReadAccessUri(null);
          setSource({ html: getErrorHtml(message) });
        }
      }
    })();

    return () => {
      cancelled = true;
      resetPendingRequests('WebView unmounted');
      rejectReadyWaiters('WebView unmounted');
    };
  }, [handleWebViewReload, rejectReadyWaiters, resetPendingRequests]);

  const resolveReady = useCallback(() => {
    setIsReady(true);
    for (const waiter of readyWaitersRef.current) waiter.resolve();
    readyWaitersRef.current = [];
  }, []);

  const awaitReady = useCallback(() => {
    if (isReady) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      readyWaitersRef.current.push({ resolve, reject });
    });
  }, [isReady]);

  const postRpc = useCallback(
    async (message: RpcRequest, timeoutMs = RPC_TIMEOUT_MS) => {
      await awaitReady();
      const webView = webViewRef.current;
      if (!webView) {
        throw new Error('WebView not ready yet');
      }

      return await new Promise<unknown>((resolve, reject) => {
        const id = message.id;

        const timeout = setTimeout(() => {
          pendingRef.current.delete(id);
          reject(new Error(`WebView RPC timed out after ${timeoutMs}ms (${message.method})`));
        }, timeoutMs);

        pendingRef.current.set(id, { resolve, reject, timeout });
        webView.postMessage(JSON.stringify(message));
      });
    },
    [awaitReady],
  );

  const getBundledWasmBase64 = useCallback(async () => {
    if (Platform.OS === 'web') return null;

    if (wasmBase64Ref.current) return wasmBase64Ref.current;
    const promise =
      wasmBase64PromiseRef.current ??
      (async () => {
        try {
          const wasmBase64 = await readAssetString(embeddedServerWasmAsset, FileSystem.EncodingType.Base64);
          wasmBase64Ref.current = wasmBase64;
          return wasmBase64;
        } catch {
          return null;
        }
      })();

    wasmBase64PromiseRef.current = promise;
    const wasmBase64 = await promise;
    if (!wasmBase64) {
      wasmBase64PromiseRef.current = null;
    }
    return wasmBase64;
  }, []);

  const ensureBundledWasmUploaded = useCallback(async () => {
    if (Platform.OS === 'web') return;
    if (wasmUploadedRef.current) return;

    wasmUploadPromiseRef.current ??= (async () => {
      try {
        const wasmBase64 = await getBundledWasmBase64();
        if (!wasmBase64) return;

        const total = Math.ceil(wasmBase64.length / WASM_UPLOAD_CHUNK_SIZE);
        const uploadId = createRequestId();

        for (let index = 0; index < total; index++) {
          const chunk = wasmBase64.slice(
            index * WASM_UPLOAD_CHUNK_SIZE,
            Math.min((index + 1) * WASM_UPLOAD_CHUNK_SIZE, wasmBase64.length),
          );
          const message: RpcRequest = {
            type: 'rpc',
            id: createRequestId(),
            method: 'wasmUpload',
            params: { uploadId, index, total, chunk },
          };
          await postRpc(message, WASM_UPLOAD_TIMEOUT_MS);
        }

        wasmUploadedRef.current = true;
        wasmBase64Ref.current = null;
        wasmBase64PromiseRef.current = null;
      } finally {
        if (!wasmUploadedRef.current) {
          wasmUploadPromiseRef.current = null;
        }
      }
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

        void (async () => {
          try {
            const result = await (handler as (payload: unknown) => unknown)(msg.payload);
            if (!msg.expectsResponse) return;
            const response: CallbackResponse = { type: 'callbackResponse', id: msg.id, ok: true, result };
            webViewRef.current?.postMessage(JSON.stringify(response));
          } catch (e) {
            if (!msg.expectsResponse) return;
            const message = e instanceof Error ? e.message : String(e);
            const response: CallbackResponse = {
              type: 'callbackResponse',
              id: msg.id,
              ok: false,
              error: { name: e instanceof Error ? e.name : 'Error', message },
            };
            webViewRef.current?.postMessage(JSON.stringify(response));
          }
        })();

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

  const onLoadStart = useCallback(() => {
    if (!isReady) return;
    handleWebViewReload('WebView reloaded');
  }, [handleWebViewReload, isReady]);

  useImperativeHandle(
    ref,
    () => ({
      isReady: () => isReady,
      init: async (params) => {
        callbacksRef.current.clear();
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
      checkResource: async (request: CheckResourceRequest) => {
        const message: RpcRequest = {
          type: 'rpc',
          id: createRequestId(),
          method: 'checkResource',
          params: request,
        };
        return await postRpc(message);
      },
      checkResources: async (request: CheckResourcesRequest) => {
        const message: RpcRequest = {
          type: 'rpc',
          id: createRequestId(),
          method: 'checkResources',
          params: request,
        };
        return await postRpc(message);
      },
      planResources: async (request: PlanResourcesRequest) => {
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
      containerStyle={containerStyle}
      originWhitelist={['*']}
      javaScriptEnabled
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      allowingReadAccessToURL={bridgeReadAccessUri ?? undefined}
      domStorageEnabled
      setSupportMultipleWindows={false}
      source={source}
      onLoadStart={onLoadStart}
      onMessage={onMessage}
    />
  );
});

CerbosEmbeddedWebView.displayName = 'CerbosEmbeddedWebView';
