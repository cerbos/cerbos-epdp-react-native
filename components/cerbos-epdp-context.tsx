import type {
  CheckResourceRequest,
  CheckResourcesRequest,
  DecisionLogEntry,
  JWT,
  PlanResourcesRequest,
  Value,
} from '@cerbos/core';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  CerbosEmbeddedWebView,
  type CerbosWebViewHandle,
  type EmbeddedClientOptionsPayload,
  type PolicyOptionsPayload,
} from '@/components/cerbos-embedded-webview';

type DecisionLogItem = { ts: number; entry: DecisionLogEntry };
type EventLogItem = { ts: number; type: 'validationErrors' | 'policyUpdate'; payload: unknown };

type CerbosEpdpContextValue = {
  // Config
  ruleId: string;
  setRuleId: (v: string) => void;
  hubClientId: string;
  setHubClientId: (v: string) => void;
  hubClientSecret: string;
  setHubClientSecret: (v: string) => void;
  hubBaseUrl: string;
  setHubBaseUrl: (v: string) => void;
  embeddedOptionsJson: string;
  setEmbeddedOptionsJson: (v: string) => void;
  policyOptionsJson: string;
  setPolicyOptionsJson: (v: string) => void;

  // Callbacks
  enableOnDecision: boolean;
  setEnableOnDecision: (v: boolean) => void;
  enableOnValidationError: boolean;
  setEnableOnValidationError: (v: boolean) => void;
  enableDecodeJwtPayload: boolean;
  setEnableDecodeJwtPayload: (v: boolean) => void;
  enablePolicyOnUpdate: boolean;
  setEnablePolicyOnUpdate: (v: boolean) => void;

  // Init + status
  isInitializing: boolean;
  initError: string;
  initSuccess: string;
  init: () => Promise<boolean>;

  // checkResource
  checkResourceJson: string;
  setCheckResourceJson: (v: string) => void;
  isCheckingResource: boolean;
  checkResourceResult: string;
  checkResource: () => Promise<void>;

  // checkResources
  checkResourcesJson: string;
  setCheckResourcesJson: (v: string) => void;
  isCheckingResources: boolean;
  checkResourcesResult: string;
  checkResources: () => Promise<void>;

  // planResources
  planResourcesJson: string;
  setPlanResourcesJson: (v: string) => void;
  isPlanningResources: boolean;
  planResourcesResult: string;
  planResources: () => Promise<void>;

  // Audit (decision log)
  decisionLog: DecisionLogItem[];
  clearDecisionLog: () => void;
  eventLog: EventLogItem[];
  clearEventLog: () => void;
};

const CerbosEpdpContext = createContext<CerbosEpdpContextValue | null>(null);

function parseJson<T>(input: string, label: string): T {
  try {
    return JSON.parse(input) as T;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
}

function stringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function CerbosEpdpProvider({ children }: { children: React.ReactNode }) {
  const webViewRef = useRef<CerbosWebViewHandle>(null);

  const [ruleId, setRuleId] = useState('AVGB9RP6HFBL');
  const [hubClientId, setHubClientId] = useState('');
  const [hubClientSecret, setHubClientSecret] = useState('');
  const [hubBaseUrl, setHubBaseUrl] = useState('https://api.cerbos.cloud');

  const [embeddedOptionsJson, setEmbeddedOptionsJson] = useState(
    JSON.stringify(
      {
        schemaEnforcement: 'warn',
        lenientScopeSearch: false,
        onValidationError: 'return',
      },
      null,
      2,
    ),
  );

  const [policyOptionsJson, setPolicyOptionsJson] = useState(
    JSON.stringify(
      {
        scopes: [],
        activateOnLoad: true,
        interval: 60,
      },
      null,
      2,
    ),
  );

  const [enableOnDecision, setEnableOnDecision] = useState(true);
  const [enableOnValidationError, setEnableOnValidationError] = useState(false);
  const [enableDecodeJwtPayload, setEnableDecodeJwtPayload] = useState(false);
  const [enablePolicyOnUpdate, setEnablePolicyOnUpdate] = useState(false);

  const [decisionLog, setDecisionLog] = useState<DecisionLogItem[]>([]);
  const clearDecisionLog = useCallback(() => setDecisionLog([]), []);
  const [eventLog, setEventLog] = useState<EventLogItem[]>([]);
  const clearEventLog = useCallback(() => setEventLog([]), []);

  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState('');
  const [initSuccess, setInitSuccess] = useState('');

  const [checkResourceJson, setCheckResourceJson] = useState(
    JSON.stringify(
      {
        "requestId": "7d22d4bf-bffd-4ea1-9725-c7ad086675bb",
        "resource": {
          "kind": "app::expense",
          "id": "expense6",
          "attr": {
            "amount": 20,
            "approvedBy": "frank",
            "createdAt": "2025-12-12T11:43:47.701Z",
            "ownerId": "audrey",
            "region": "EMEA",
            "status": "APPROVED",
            "vendor": "Pencils & Co"
          },
          "scope": "ACME"
        },
        "principal": {
          "id": "audrey",
          "roles": [
            "USER"
          ],
          "attr": {
            "department": "IT",
            "name": "Audrey Auditor",
            "organizations": [
              "ACME"
            ],
            "region": "EMEA"
          }
        },
        "actions": [
          "view",
          "view:approver",
          "update",
          "delete",
          "approve"
        ]
      },
      null,
      2,
    ),
  );
  const [isCheckingResource, setIsCheckingResource] = useState(false);
  const [checkResourceResult, setCheckResourceResult] = useState('');

  const [checkResourcesJson, setCheckResourcesJson] = useState(
    JSON.stringify(
      {
        principal: { id: 'user@example.com', roles: ['USER'], attr: { tier: 'PREMIUM' } },
        resources: [
          { resource: { kind: 'document', id: '1', attr: { owner: 'user@example.com' } }, actions: ['view', 'edit'] },
          { resource: { kind: 'document', id: '2', attr: { owner: 'someone-else@example.com' } }, actions: ['view', 'edit'] },
        ],
        includeMetadata: true,
      },
      null,
      2,
    ),
  );
  const [isCheckingResources, setIsCheckingResources] = useState(false);
  const [checkResourcesResult, setCheckResourcesResult] = useState('');

  const [planResourcesJson, setPlanResourcesJson] = useState(
    JSON.stringify(
      {
        "requestId": "cc60fdc4-913d-4809-ad2f-55c1506c4f8c",
        "action": "view",
        "actions": [
          "view"
        ],
        "principal": {
          "id": "audrey",
          "roles": [
            "USER"
          ],
          "attr": {
            "department": "IT",
            "name": "Audrey Auditor",
            "organizations": [
              "ACME"
            ],
            "region": "EMEA"
          }
        },
        "resource": {
          "kind": "app::expense",
          "scope": "ACME"
        }
      },
      null,
      2,
    ),
  );
  const [isPlanningResources, setIsPlanningResources] = useState(false);
  const [planResourcesResult, setPlanResourcesResult] = useState('');

  const init = useCallback(async () => {
    if (!ruleId.trim()) {
      setInitError('Missing ruleId');
      return false;
    }
    if (Platform.OS === 'web') {
      setInitError('This demo does not support web (bundled WASM is uploaded from native to WebView).');
      return false;
    }

    setIsInitializing(true);
    setInitError('');
    setInitSuccess('');

    try {
      if (!webViewRef.current) {
        throw new Error('WebView not ready yet');
      }

      const options = parseJson<EmbeddedClientOptionsPayload>(embeddedOptionsJson || '{}', 'Embedded options JSON');
      const policyOptions = parseJson<PolicyOptionsPayload>(policyOptionsJson || '{}', 'Policy options JSON');

      await webViewRef.current?.init({
        ruleId: ruleId.trim(),
        hubClientId: hubClientId.trim() || undefined,
        hubClientSecret: hubClientSecret.trim() || undefined,
        hubBaseUrl: hubBaseUrl.trim() || undefined,
        options,
        policyOptions,
        callbacks: {
          onDecision: enableOnDecision
            ? async (entry) => {
              setDecisionLog((prev) => {
                const next: DecisionLogItem[] = [{ ts: Date.now(), entry }, ...prev];
                return next.slice(0, 200);
              });
            }
            : undefined,
          onValidationError: enableOnValidationError
            ? async (validationErrors) => {
              const item: EventLogItem = { ts: Date.now(), type: 'validationErrors', payload: validationErrors };
              setEventLog((prev) => [item, ...prev].slice(0, 200));
            }
            : undefined,
          decodeJWTPayload: enableDecodeJwtPayload
            ? async (jwt: JWT) => {
              if (!jwt?.token) throw new Error('Missing JWT token');
              const payload = decodeJwtPayloadUnsafe(jwt.token) as Record<string, Value>;
              return payload;
            }
            : undefined,
          onPolicyUpdate: enablePolicyOnUpdate
            ? async (error) => {
              const item: EventLogItem = { ts: Date.now(), type: 'policyUpdate', payload: error };
              setEventLog((prev) => [item, ...prev].slice(0, 200));
            }
            : undefined,
        },
      });
      setInitSuccess(`Initialized at ${new Date().toISOString()}`);
      return true;
    } catch (e) {
      setInitError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setIsInitializing(false);
    }
  }, [
    embeddedOptionsJson,
    enableDecodeJwtPayload,
    enableOnDecision,
    enableOnValidationError,
    enablePolicyOnUpdate,
    hubBaseUrl,
    hubClientId,
    hubClientSecret,
    policyOptionsJson,
    ruleId,
  ]);

  const checkResource = useCallback(async () => {
    setIsCheckingResource(true);
    setCheckResourceResult('');
    try {
      const request = parseJson<CheckResourceRequest>(checkResourceJson, 'checkResource JSON');
      const result = await webViewRef.current?.checkResource(request);
      setCheckResourceResult(stringify(result));
    } catch (e) {
      setCheckResourceResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCheckingResource(false);
    }
  }, [checkResourceJson]);

  const checkResources = useCallback(async () => {
    setIsCheckingResources(true);
    setCheckResourcesResult('');
    try {
      const request = parseJson<CheckResourcesRequest>(checkResourcesJson, 'checkResources JSON');
      const result = await webViewRef.current?.checkResources(request);
      setCheckResourcesResult(stringify(result));
    } catch (e) {
      setCheckResourcesResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCheckingResources(false);
    }
  }, [checkResourcesJson]);

  const planResources = useCallback(async () => {
    setIsPlanningResources(true);
    setPlanResourcesResult('');
    try {
      const request = parseJson<PlanResourcesRequest>(planResourcesJson, 'planResources JSON');
      const result = await webViewRef.current?.planResources(request);
      setPlanResourcesResult(stringify(result));
    } catch (e) {
      setPlanResourcesResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsPlanningResources(false);
    }
  }, [planResourcesJson]);

  const value: CerbosEpdpContextValue = useMemo(
    () => ({
      ruleId,
      setRuleId,
      hubClientId,
      setHubClientId,
      hubClientSecret,
      setHubClientSecret,
      hubBaseUrl,
      setHubBaseUrl,
      embeddedOptionsJson,
      setEmbeddedOptionsJson,
      policyOptionsJson,
      setPolicyOptionsJson,
      enableOnDecision,
      setEnableOnDecision,
      enableOnValidationError,
      setEnableOnValidationError,
      enableDecodeJwtPayload,
      setEnableDecodeJwtPayload,
      enablePolicyOnUpdate,
      setEnablePolicyOnUpdate,
      isInitializing,
      initError,
      initSuccess,
      init,
      checkResourceJson,
      setCheckResourceJson,
      isCheckingResource,
      checkResourceResult,
      checkResource,
      checkResourcesJson,
      setCheckResourcesJson,
      isCheckingResources,
      checkResourcesResult,
      checkResources,
      planResourcesJson,
      setPlanResourcesJson,
      isPlanningResources,
      planResourcesResult,
      planResources,
      decisionLog,
      clearDecisionLog,
      eventLog,
      clearEventLog,
    }),
    [
      checkResource,
      checkResourceJson,
      checkResourceResult,
      checkResources,
      checkResourcesJson,
      checkResourcesResult,
      clearDecisionLog,
      decisionLog,
      clearEventLog,
      eventLog,
      embeddedOptionsJson,
      enableDecodeJwtPayload,
      enableOnDecision,
      enableOnValidationError,
      enablePolicyOnUpdate,
      hubBaseUrl,
      hubClientId,
      hubClientSecret,
      init,
      initError,
      initSuccess,
      isCheckingResource,
      isCheckingResources,
      isInitializing,
      isPlanningResources,
      planResources,
      planResourcesJson,
      planResourcesResult,
      policyOptionsJson,
      ruleId,
    ],
  );

  return (
    <CerbosEpdpContext.Provider value={value}>
      <View style={styles.container}>
        {children}
        <CerbosEmbeddedWebView
          ref={webViewRef}
          containerStyle={styles.hiddenWebViewContainer}
          style={styles.hiddenWebView}
        />
      </View>
    </CerbosEpdpContext.Provider>
  );
}

export function useCerbosEpdp() {
  const ctx = useContext(CerbosEpdpContext);
  if (!ctx) {
    throw new Error('useCerbosEpdp must be used within CerbosEpdpProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hiddenWebViewContainer: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, flex: 0, opacity: 0 },
  hiddenWebView: { width: 1, height: 1 },
});

function decodeJwtPayloadUnsafe(token: string) {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid JWT format');
  }
  const payloadB64Url = parts[1];
  const json = base64UrlDecodeToString(payloadB64Url);
  return JSON.parse(json) as unknown;
}

function base64UrlDecodeToString(base64Url: string) {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;

  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(padded);
  }

  const bytes = base64ToBytes(padded);
  if (typeof globalThis.TextDecoder === 'function') {
    return new TextDecoder().decode(bytes);
  }

  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

function base64ToBytes(base64: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  lookup.fill(255);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const clean = base64.replace(/=+$/, '');
  const len = clean.length;
  const outLen = Math.floor((len * 3) / 4);
  const out = new Uint8Array(outLen);

  let buffer = 0;
  let bits = 0;
  let outIndex = 0;

  for (let i = 0; i < len; i++) {
    const code = clean.charCodeAt(i);
    const val = lookup[code];
    if (val === 255) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIndex++] = (buffer >> bits) & 0xff;
    }
  }

  return outIndex === out.length ? out : out.slice(0, outIndex);
}
