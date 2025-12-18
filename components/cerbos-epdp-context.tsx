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

import type { Options as EmbeddedClientOptions, PolicyLoaderOptions } from '@cerbos/embedded-client';

import { CerbosEmbeddedWebView, type CerbosWebViewHandle } from '@/components/cerbos-embedded-webview';

type DecisionLogItem = { ts: number; entry: DecisionLogEntry };
type EventLogItem = { ts: number; type: 'validationErrors' | 'policyUpdate'; payload: unknown };

export type CerbosEpdpInitParams = {
  ruleId: string;
  hubClientId?: string;
  hubClientSecret?: string;
  hubBaseUrl?: string;
  options?: Partial<
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
  policyOptions?: Partial<Pick<PolicyLoaderOptions, 'scopes' | 'activateOnLoad' | 'interval'>>;
  enableOnDecision?: boolean;
  enableOnValidationError?: boolean;
  enableDecodeJwtPayload?: boolean;
  enablePolicyOnUpdate?: boolean;
};

type CerbosEpdpContextValue = {
  // Methods
  init: (params: CerbosEpdpInitParams) => Promise<void>;
  checkResource: (request: CheckResourceRequest) => Promise<unknown>;
  checkResources: (request: CheckResourcesRequest) => Promise<unknown>;
  planResources: (request: PlanResourcesRequest) => Promise<unknown>;

  // Audit (decision log)
  decisionLog: DecisionLogItem[];
  clearDecisionLog: () => void;
  eventLog: EventLogItem[];
  clearEventLog: () => void;
};

const CerbosEpdpContext = createContext<CerbosEpdpContextValue | null>(null);

export function CerbosEpdpProvider({ children }: { children: React.ReactNode }) {
  const webViewRef = useRef<CerbosWebViewHandle>(null);
  const initInFlightRef = useRef(false);

  const [decisionLog, setDecisionLog] = useState<DecisionLogItem[]>([]);
  const clearDecisionLog = useCallback(() => setDecisionLog([]), []);
  const [eventLog, setEventLog] = useState<EventLogItem[]>([]);
  const clearEventLog = useCallback(() => setEventLog([]), []);

  const init = useCallback(async (params: CerbosEpdpInitParams) => {
    const ruleId = params.ruleId.trim();
    if (!ruleId) {
      throw new Error('Missing ruleId');
    }
    if (Platform.OS === 'web') {
      throw new Error('This demo does not support web (bundled WASM is uploaded from native to WebView).');
    }

    if (initInFlightRef.current) {
      throw new Error('Initialization already in progress');
    }

    initInFlightRef.current = true;
    try {
      if (!webViewRef.current) {
        throw new Error('WebView not ready yet');
      }

      await webViewRef.current.init({
        ruleId,
        hubClientId: params.hubClientId?.trim() || undefined,
        hubClientSecret: params.hubClientSecret?.trim() || undefined,
        hubBaseUrl: params.hubBaseUrl?.trim() || undefined,
        options: params.options,
        policyOptions: params.policyOptions,
        callbacks: {
          onDecision: params.enableOnDecision
            ? async (entry) => {
              setDecisionLog((prev) => {
                const next: DecisionLogItem[] = [{ ts: Date.now(), entry }, ...prev];
                return next.slice(0, 200);
              });
            }
            : undefined,
          onValidationError: params.enableOnValidationError
            ? async (validationErrors) => {
              const item: EventLogItem = { ts: Date.now(), type: 'validationErrors', payload: validationErrors };
              setEventLog((prev) => [item, ...prev].slice(0, 200));
            }
            : undefined,
          decodeJWTPayload: params.enableDecodeJwtPayload
            ? async (jwt: JWT) => {
              if (!jwt?.token) throw new Error('Missing JWT token');
              const payload = decodeJwtPayloadUnsafe(jwt.token) as Record<string, Value>;
              return payload;
            }
            : undefined,
          onPolicyUpdate: params.enablePolicyOnUpdate
            ? async (error) => {
              const item: EventLogItem = { ts: Date.now(), type: 'policyUpdate', payload: error };
              setEventLog((prev) => [item, ...prev].slice(0, 200));
            }
            : undefined,
        },
      });
    } finally {
      initInFlightRef.current = false;
    }
  }, []);

  const checkResource = useCallback(async (request: CheckResourceRequest) => {
    if (!webViewRef.current) throw new Error('WebView not ready yet');
    return await webViewRef.current.checkResource(request);
  }, []);

  const checkResources = useCallback(async (request: CheckResourcesRequest) => {
    if (!webViewRef.current) throw new Error('WebView not ready yet');
    return await webViewRef.current.checkResources(request);
  }, []);

  const planResources = useCallback(async (request: PlanResourcesRequest) => {
    if (!webViewRef.current) throw new Error('WebView not ready yet');
    return await webViewRef.current.planResources(request);
  }, []);

  const value: CerbosEpdpContextValue = useMemo(
    () => ({
      init,
      checkResource,
      checkResources,
      planResources,
      decisionLog,
      clearDecisionLog,
      eventLog,
      clearEventLog,
    }),
    [
      checkResource,
      checkResources,
      clearDecisionLog,
      decisionLog,
      clearEventLog,
      eventLog,
      init,
      planResources,
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
