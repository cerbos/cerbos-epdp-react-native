import React, { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CheckResourceRequest, CheckResourcesRequest, JWT, PlanResourcesRequest, Value } from '@cerbos/core';

import {
  CerbosEmbeddedWebView,
  type EmbeddedClientOptionsPayload,
  type PolicyOptionsPayload,
  type CerbosWebViewHandle,
} from '@/components/cerbos-embedded-webview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  const webViewRef = useRef<CerbosWebViewHandle>(null);

  const [ruleId, setRuleId] = useState('AVGB9RP6HFBL');
  const [hubClientId, setHubClientId] = useState('');
  const [hubClientSecret, setHubClientSecret] = useState('');
  const [hubBaseUrl, setHubBaseUrl] = useState('https://api.cerbos.cloud');

  const [isInitializing, setIsInitializing] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [callingMethod, setCallingMethod] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

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

  const [callbackLog, setCallbackLog] = useState('');

  const defaultRequestText = useMemo(
    () =>
      JSON.stringify(
        {
          "requestId": "06fa7602-53e4-406a-9fc7-6fcb2a96c20d",
          "resource": {
            "kind": "mcp::server",
            "id": "tools/call",
            "attr": {
              "arguments": {
                "query": "airlines"
              },
              "name": "search_expenses"
            }
          },
          "principal": {
            "id": "sally",
            "roles": [
              "USER"
            ],
            "attr": {
              "department": "SALES",
              "name": "Sally Sales",
              "organizations": [
                "ACME"
              ],
              "region": "EMEA"
            }
          },
          "actions": [
            "tools/call"
          ]
        },
        null,
        2,
      ),
    [],
  );

  const [requestText, setRequestText] = useState(defaultRequestText);

  const defaultCheckResourcesText = useMemo(
    () =>
      JSON.stringify(
        {
          principal: {
            id: 'user@example.com',
            roles: ['USER'],
            attr: { tier: 'PREMIUM' },
          },
          resources: [
            {
              resource: {
                kind: 'document',
                id: '1',
                attr: { owner: 'user@example.com' },
              },
              actions: ['view', 'edit'],
            },
            {
              resource: {
                kind: 'document',
                id: '2',
                attr: { owner: 'someone-else@example.com' },
              },
              actions: ['view', 'edit'],
            },
          ],
          includeMetadata: true,
        },
        null,
        2,
      ),
    [],
  );
  const [checkResourcesText, setCheckResourcesText] = useState(defaultCheckResourcesText);

  const defaultPlanResourcesText = useMemo(
    () =>
      JSON.stringify(
        {
          principal: {
            id: 'user@example.com',
            roles: ['USER'],
            attr: { tier: 'PREMIUM' },
          },
          resource: {
            kind: 'document',
            attr: { owner: 'user@example.com' },
          },
          action: 'view',
          includeMetadata: true,
        },
        null,
        2,
      ),
    [],
  );
  const [planResourcesText, setPlanResourcesText] = useState(defaultPlanResourcesText);

  const appendLog = (line: string) => {
    setCallbackLog((prev) => {
      const next = `${new Date().toISOString()} ${line}\n${prev}`.trimEnd();
      return next.length > 20_000 ? next.slice(0, 20_000) : next;
    });
  };

  const decodeJwtPayloadUnsafe = (token: string) => {
    const parts = token.split('.');
    if (parts.length < 2) throw new Error('Invalid JWT format');
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4;
    const padded = pad ? payload + '='.repeat(4 - pad) : payload;
    if (!globalThis.atob) {
      throw new Error('atob() is not available in this runtime (add a base64 polyfill to use decodeJWTPayload)');
    }
    const json = globalThis.atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  };

  const init = async () => {
    if (!ruleId.trim()) {
      Alert.alert('Missing rule ID', 'Enter a Cerbos Hub rule ID to initialize the embedded client.');
      return;
    }

    setIsInitializing(true);
    setResponseText('');
    try {
      const parsedEmbeddedOptions = JSON.parse(embeddedOptionsJson || '{}') as EmbeddedClientOptionsPayload;
      const parsedPolicyOptions = JSON.parse(policyOptionsJson || '{}') as PolicyOptionsPayload;

      const callbacks = {
        onDecision: enableOnDecision
          ? async (entry: unknown) => {
              appendLog(`onDecision: ${JSON.stringify(entry).slice(0, 2000)}`);
            }
          : undefined,
        onValidationError: enableOnValidationError
          ? async (errors: unknown) => {
              appendLog(`onValidationError: ${JSON.stringify(errors).slice(0, 2000)}`);
            }
          : undefined,
        decodeJWTPayload: enableDecodeJwtPayload
          ? async (jwt: JWT) => {
              if (!jwt?.token) throw new Error('Missing token');
              const decoded = decodeJwtPayloadUnsafe(jwt.token) as Record<string, Value>;
              appendLog(`decodeJWTPayload: decoded ${Object.keys(decoded).length} keys`);
              return decoded;
            }
          : undefined,
        onPolicyUpdate: enablePolicyOnUpdate
          ? async (error: unknown) => {
              appendLog(`onPolicyUpdate: ${JSON.stringify(error).slice(0, 2000)}`);
            }
          : undefined,
      };

      await webViewRef.current?.init({
        ruleId: ruleId.trim(),
        hubClientId: hubClientId.trim() || undefined,
        hubClientSecret: hubClientSecret.trim() || undefined,
        hubBaseUrl: hubBaseUrl.trim() || undefined,
        options: parsedEmbeddedOptions,
        policyOptions: parsedPolicyOptions,
        callbacks,
      });
      Alert.alert('Initialized', 'Embedded client initialized inside the WebView.');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Init failed', message);
    } finally {
      setIsInitializing(false);
    }
  };

  const checkResource = async () => {
    setIsCalling(true);
    setCallingMethod('checkResource');
    setResponseText('');
    try {
      const request = JSON.parse(requestText) as CheckResourceRequest;
      const result = await webViewRef.current?.checkResource(request);
      setResponseText(JSON.stringify(result, null, 2));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setResponseText(`Error: ${message}`);
    } finally {
      setIsCalling(false);
      setCallingMethod(null);
    }
  };

  const checkResources = async () => {
    setIsCalling(true);
    setCallingMethod('checkResources');
    setResponseText('');
    try {
      const request = JSON.parse(checkResourcesText) as CheckResourcesRequest;
      const result = await webViewRef.current?.checkResources(request);
      setResponseText(JSON.stringify(result, null, 2));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setResponseText(`Error: ${message}`);
    } finally {
      setIsCalling(false);
      setCallingMethod(null);
    }
  };

  const planResources = async () => {
    setIsCalling(true);
    setCallingMethod('planResources');
    setResponseText('');
    try {
      const request = JSON.parse(planResourcesText) as PlanResourcesRequest;
      const result = await webViewRef.current?.planResources(request);
      setResponseText(JSON.stringify(result, null, 2));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setResponseText(`Error: ${message}`);
    } finally {
      setIsCalling(false);
      setCallingMethod(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.section}>
          <ThemedText type="title">Cerbos Embedded (WebView)</ThemedText>
          <ThemedText style={styles.muted}>
            This screen initializes `@cerbos/embedded-client` inside a WebView and calls `checkResource`, `checkResources`, and `planResources` via postMessage.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Client config</ThemedText>

          <ThemedText style={styles.label}>Rule ID</ThemedText>
          <TextInput
            style={styles.input}
            value={ruleId}
            onChangeText={setRuleId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. B5LU9EVYN1MD"
          />

          <ThemedText style={styles.label}>Hub Client ID</ThemedText>
          <TextInput
            style={styles.input}
            value={hubClientId}
            onChangeText={setHubClientId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="CERBOS_HUB_CLIENT_ID"
          />

          <ThemedText style={styles.label}>Hub Client Secret</ThemedText>
          <TextInput
            style={styles.input}
            value={hubClientSecret}
            onChangeText={setHubClientSecret}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="CERBOS_HUB_CLIENT_SECRET"
          />

          <ThemedText style={styles.label}>Hub Base URL</ThemedText>
          <TextInput
            style={styles.input}
            value={hubBaseUrl}
            onChangeText={setHubBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://api.cerbos.cloud"
          />

          <ThemedText style={styles.label}>Embedded client options (JSON)</ThemedText>
          <TextInput
            style={[styles.input, styles.multilineSmall]}
            value={embeddedOptionsJson}
            onChangeText={setEmbeddedOptionsJson}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
          />

          <ThemedText style={styles.label}>Policy loader options (JSON)</ThemedText>
          <TextInput
            style={[styles.input, styles.multilineSmall]}
            value={policyOptionsJson}
            onChangeText={setPolicyOptionsJson}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
          />

          <ThemedText type="subtitle">Callbacks (native)</ThemedText>
          <View style={styles.toggleRow}>
            <ThemedText>onDecision</ThemedText>
            <Switch value={enableOnDecision} onValueChange={setEnableOnDecision} />
          </View>
          <View style={styles.toggleRow}>
            <ThemedText>
              onValidationError (set onValidationError: {'"callback"'})
            </ThemedText>
            <Switch value={enableOnValidationError} onValueChange={setEnableOnValidationError} />
          </View>
          <View style={styles.toggleRow}>
            <ThemedText>decodeJWTPayload (unsafe demo decode)</ThemedText>
            <Switch value={enableDecodeJwtPayload} onValueChange={setEnableDecodeJwtPayload} />
          </View>
          <View style={styles.toggleRow}>
            <ThemedText>policy onUpdate</ThemedText>
            <Switch value={enablePolicyOnUpdate} onValueChange={setEnablePolicyOnUpdate} />
          </View>

          <Pressable style={[styles.button, isInitializing && styles.buttonDisabled]} disabled={isInitializing} onPress={init}>
            <ThemedText type="defaultSemiBold">{isInitializing ? 'Initializing…' : 'Init Embedded Client'}</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">checkResource request</ThemedText>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={requestText}
            onChangeText={setRequestText}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
          />

          <Pressable style={[styles.button, isCalling && styles.buttonDisabled]} disabled={isCalling} onPress={checkResource}>
            <ThemedText type="defaultSemiBold">
              {isCalling && callingMethod === 'checkResource' ? 'Calling…' : 'Run checkResource'}
            </ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">checkResources request</ThemedText>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={checkResourcesText}
            onChangeText={setCheckResourcesText}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
          />

          <Pressable style={[styles.button, isCalling && styles.buttonDisabled]} disabled={isCalling} onPress={checkResources}>
            <ThemedText type="defaultSemiBold">
              {isCalling && callingMethod === 'checkResources' ? 'Calling…' : 'Run checkResources'}
            </ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">planResources request</ThemedText>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={planResourcesText}
            onChangeText={setPlanResourcesText}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
          />

          <Pressable style={[styles.button, isCalling && styles.buttonDisabled]} disabled={isCalling} onPress={planResources}>
            <ThemedText type="defaultSemiBold">
              {isCalling && callingMethod === 'planResources' ? 'Calling…' : 'Run planResources'}
            </ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Result</ThemedText>
          <View style={styles.result}>
            <ThemedText style={styles.resultText}>{responseText || '(no result yet)'}</ThemedText>
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Callback log</ThemedText>
          <View style={styles.result}>
            <ThemedText style={styles.resultText}>{callbackLog || '(no callbacks yet)'}</ThemedText>
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">WebView runtime</ThemedText>
          <ThemedText style={styles.muted}>
            If you don’t see results, ensure the WebView can reach the Cerbos Hub API on your device/emulator.
          </ThemedText>
          <CerbosEmbeddedWebView style={styles.webview} ref={webViewRef} />
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 16, gap: 16 },
  section: { gap: 10, padding: 12, borderRadius: 12 },
  label: { fontSize: 12, opacity: 0.75 },
  muted: { fontSize: 12, opacity: 0.7 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multiline: { minHeight: 160 },
  multilineSmall: { minHeight: 120 },
  button: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#e6e6e6',
  },
  buttonDisabled: { opacity: 0.6 },
  result: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 10,
    padding: 12,
    minHeight: 120,
  },
  resultText: { fontSize: 12, lineHeight: 18 },
  webview: { height: 120, borderRadius: 12 },
});
