import { Embedded, type DecodeJWTPayload, type DecodedJWTPayload } from '@cerbos/embedded-client';
import type {
  CallbackResponse,
  CerbosInitParamsPayload,
  RpcRequest,
  SerializedError,
  WasmUploadParams,
} from '../components/cerbos-embedded-bridge-types';

type CallbackWaiter = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const CALLBACK_TIMEOUT_MS = 30_000;

const statusEl = document.getElementById('status');

function setStatus(text: string) {
  if (statusEl) statusEl.textContent = text;
}

function post(msg: unknown) {
  try {
    const webView = (window as { ReactNativeWebView?: { postMessage: (message: string) => void } })
      .ReactNativeWebView;
    webView?.postMessage(JSON.stringify(msg));
  } catch {
    // ignore
  }
}

function serializeError(err: unknown): SerializedError {
  const e = err ?? {};
  return {
    name: String((e as { name?: unknown }).name ?? 'Error'),
    message: String((e as { message?: unknown }).message ?? e),
    stack: typeof (e as { stack?: unknown }).stack === 'string' ? String((e as { stack?: unknown }).stack) : undefined,
  };
}

function decodeBase64ToUint8Array(base64: string) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

let bundledWasmBase64: string | null = null;
const wasmUploads = new Map<string, { total: number; chunks: string[]; received: number }>();

let cerbos: InstanceType<typeof Embedded> | null = null;

const callbackWaiters = new Map<string, CallbackWaiter>();

function postCallbackRequest(callbackId: string, payload: unknown, expectsResponse: boolean) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  post({ type: 'callback', id, callbackId, payload, expectsResponse });
  return id;
}

function callNativeCallback<T>(callbackId: string, payload: unknown) {
  const id = postCallbackRequest(callbackId, payload, true);
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const waiter = callbackWaiters.get(id);
      if (!waiter) return;
      callbackWaiters.delete(id);
      reject(new Error('Native callback timed out'));
    }, CALLBACK_TIMEOUT_MS);
    callbackWaiters.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });
  });
}

async function initClient(params: CerbosInitParamsPayload) {
  const wasmBase64 = params.wasmBase64 || bundledWasmBase64;
  const wasm = wasmBase64
    ? decodeBase64ToUint8Array(wasmBase64)
    : (() => {
        throw new Error(
          'Missing WASM. Ensure the app uploads the bundled @cerbos/embedded-server WASM before calling init.',
        );
      })();

  const { ruleId, hubClientId, hubClientSecret, hubBaseUrl } = params;
  const policyOptions = params.policyOptions || {};
  const callbackIds = params.callbackIds || {};

  const basePolicies =
    hubClientId && hubClientSecret
      ? { ruleId, credentials: { clientId: hubClientId, clientSecret: hubClientSecret }, ...(hubBaseUrl ? { baseUrl: hubBaseUrl } : {}) }
      : { ruleId, ...(hubBaseUrl ? { baseUrl: hubBaseUrl } : {}) };

  const onPolicyUpdateId = callbackIds.onPolicyUpdate;
  const policies = {
    ...basePolicies,
    ...(Array.isArray(policyOptions.scopes) ? { scopes: policyOptions.scopes } : {}),
    ...(typeof policyOptions.activateOnLoad === 'boolean' ? { activateOnLoad: policyOptions.activateOnLoad } : {}),
    ...(typeof policyOptions.interval === 'number' ? { interval: policyOptions.interval } : {}),
    ...(onPolicyUpdateId
      ? {
          onUpdate: (error: unknown) => {
            postCallbackRequest(onPolicyUpdateId, error, false);
          },
        }
      : {}),
  };

  const options = params.options || {};

  const decodeJWTPayloadId = callbackIds.decodeJWTPayload;
  const decodeJWTPayload: DecodeJWTPayload | undefined = decodeJWTPayloadId
    ? async (jwt) => await callNativeCallback<DecodedJWTPayload>(decodeJWTPayloadId, jwt)
    : undefined;

  const onDecisionId = callbackIds.onDecision;
  const onDecision = onDecisionId
    ? async (entry: unknown) => {
        postCallbackRequest(onDecisionId, entry, false);
      }
    : undefined;

  const onValidationErrorId = callbackIds.onValidationError;
  const onValidationError =
    options.onValidationError === 'throw'
      ? 'throw'
      : onValidationErrorId
        ? (errors: unknown) => {
            postCallbackRequest(onValidationErrorId, errors, false);
          }
        : undefined;

  setStatus('Initializing embedded client...');
  cerbos = new Embedded({
    policies,
    wasm,
    ...(options.headers ? { headers: options.headers } : {}),
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
    ...(options.defaultPolicyVersion ? { defaultPolicyVersion: options.defaultPolicyVersion } : {}),
    ...(options.globals ? { globals: options.globals } : {}),
    ...(typeof options.lenientScopeSearch === 'boolean' ? { lenientScopeSearch: options.lenientScopeSearch } : {}),
    ...(options.schemaEnforcement ? { schemaEnforcement: options.schemaEnforcement } : {}),
    ...(decodeJWTPayload ? { decodeJWTPayload } : {}),
    ...(onDecision ? { onDecision } : {}),
    ...(onValidationError ? { onValidationError } : {}),
  });
  setStatus('Client initialized.');
}

async function checkResource(request: unknown) {
  if (!cerbos) throw new Error('Cerbos client not initialized. Call init first.');
  const result = await cerbos.checkResource(request as never);
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

async function checkResources(request: unknown) {
  if (!cerbos) throw new Error('Cerbos client not initialized. Call init first.');
  const response = await cerbos.checkResources(request as never);
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

async function planResources(request: unknown) {
  if (!cerbos) throw new Error('Cerbos client not initialized. Call init first.');
  const response = await cerbos.planResources(request as never);
  return response;
}

async function wasmUpload(params: WasmUploadParams) {
  const { uploadId, index, total, chunk } = params || ({} as WasmUploadParams);
  if (
    !uploadId ||
    !Number.isInteger(index) ||
    !Number.isInteger(total) ||
    total <= 0 ||
    typeof chunk !== 'string'
  ) {
    throw new Error('Invalid wasmUpload params');
  }
  if (index < 0 || index >= total) {
    throw new Error('Invalid upload index');
  }

  let upload = wasmUploads.get(uploadId);
  if (!upload) {
    upload = { total, chunks: new Array(total), received: 0 };
    wasmUploads.set(uploadId, upload);
  }

  if (upload.total !== total) {
    throw new Error('Mismatched upload total');
  }

  if (upload.chunks[index] === undefined) {
    upload.received++;
  }
  upload.chunks[index] = chunk;

  if (upload.received >= upload.total) {
    bundledWasmBase64 = upload.chunks.join('');
    wasmUploads.delete(uploadId);
    return { done: true };
  }

  return { done: false, received: upload.received, total: upload.total };
}

const handlers = { init: initClient, checkResource, checkResources, planResources, wasmUpload };

async function handleRpc(msg: RpcRequest) {
  const { id, method, params } = msg;
  try {
    const handler = handlers[method];
    if (!handler) throw new Error(`Unknown method: ${method}`);
    const result = await handler(params as never);
    post({ type: 'rpcResponse', id, ok: true, result });
  } catch (err) {
    post({ type: 'rpcResponse', id, ok: false, error: serializeError(err) });
  }
}

function receive(event: MessageEvent) {
  const data = event?.data;
  if (typeof data !== 'string') return;
  let msg: RpcRequest | CallbackResponse | undefined;
  try {
    msg = JSON.parse(data) as RpcRequest | CallbackResponse;
  } catch {
    return;
  }
  if (!msg || (msg.type !== 'rpc' && msg.type !== 'callbackResponse')) return;
  if (msg.type === 'rpc') {
    void handleRpc(msg);
    return;
  }

  const waiter = callbackWaiters.get(msg.id);
  if (!waiter) return;
  callbackWaiters.delete(msg.id);
  clearTimeout(waiter.timeout);
  if (msg.ok) waiter.resolve(msg.result);
  else waiter.reject(new Error(msg.error?.message || 'Native callback failed'));
}

document.addEventListener('message', receive as EventListener);
window.addEventListener('message', receive as EventListener);

setStatus('Bridge ready.');
post({ type: 'ready' });
