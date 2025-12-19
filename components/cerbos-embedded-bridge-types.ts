import type {
  DecodeJWTPayload,
  DecodedJWTPayload,
  Options as EmbeddedClientOptions,
  PolicyLoaderOptions,
} from '@cerbos/embedded-client';
import type {
  CheckResourceRequest,
  CheckResourcesRequest,
  DecisionLogEntry,
  NotOK,
  PlanResourcesRequest,
  ValidationError,
} from '@cerbos/core';

export type SerializedError = { name: string; message: string; stack?: string };

export type CerbosInitOptions = {
  ruleId: string;
  hubClientId?: string;
  hubClientSecret?: string;
  hubBaseUrl?: string;
  wasmBase64?: string;
};

export type EmbeddedClientOptionsInput = Partial<
  Pick<
    EmbeddedClientOptions,
    | 'headers'
    | 'userAgent'
    | 'defaultPolicyVersion'
    | 'globals'
    | 'lenientScopeSearch'
    | 'schemaEnforcement'
    | 'onValidationError'
  >
>;

export type PolicyOptionsInput = Partial<Pick<PolicyLoaderOptions, 'scopes' | 'activateOnLoad' | 'interval'>>;

export type CerbosCallbacks = {
  onDecision?: (entry: DecisionLogEntry) => void | Promise<void>;
  onValidationError?: (validationErrors: ValidationError[]) => void | Promise<void>;
  decodeJWTPayload?: (jwt: Parameters<DecodeJWTPayload>[0]) => Promise<DecodedJWTPayload> | DecodedJWTPayload;
  onPolicyUpdate?: (error: NotOK | undefined) => void | Promise<void>;
};

export type CallbackIdsPayload = {
  onDecision?: string;
  onValidationError?: string;
  decodeJWTPayload?: string;
  onPolicyUpdate?: string;
};

export type CerbosInitParamsPayload = CerbosInitOptions & {
  options?: EmbeddedClientOptionsInput;
  policyOptions?: PolicyOptionsInput;
  callbackIds?: CallbackIdsPayload;
};

export type WasmUploadParams = {
  uploadId: string;
  index: number;
  total: number;
  chunk: string;
};

export type RpcRequest =
  | { type: 'rpc'; id: string; method: 'init'; params: CerbosInitParamsPayload }
  | { type: 'rpc'; id: string; method: 'wasmUpload'; params: WasmUploadParams }
  | { type: 'rpc'; id: string; method: 'checkResource'; params: CheckResourceRequest }
  | { type: 'rpc'; id: string; method: 'checkResources'; params: CheckResourcesRequest }
  | { type: 'rpc'; id: string; method: 'planResources'; params: PlanResourcesRequest };

export type RpcResponse =
  | { type: 'ready' }
  | { type: 'rpcResponse'; id: string; ok: true; result: unknown }
  | { type: 'rpcResponse'; id: string; ok: false; error: SerializedError };

export type CallbackRequest = {
  type: 'callback';
  id: string;
  callbackId: string;
  payload: unknown;
  expectsResponse?: boolean;
};

export type CallbackResponse =
  | { type: 'callbackResponse'; id: string; ok: true; result: unknown }
  | { type: 'callbackResponse'; id: string; ok: false; error: SerializedError };

export type CerbosWebViewHandle = {
  isReady: () => boolean;
  init: (
    params: CerbosInitOptions & {
      options?: EmbeddedClientOptionsInput;
      policyOptions?: PolicyOptionsInput;
      callbacks?: CerbosCallbacks;
    },
  ) => Promise<void>;
  checkResource: (request: CheckResourceRequest) => Promise<unknown>;
  checkResources: (request: CheckResourcesRequest) => Promise<unknown>;
  planResources: (request: PlanResourcesRequest) => Promise<unknown>;
};
