import React, { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CerbosEmbeddedWebView, defaultWasmUrl, type CerbosWebViewHandle } from '@/components/cerbos-embedded-webview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  const webViewRef = useRef<CerbosWebViewHandle>(null);

  const [ruleId, setRuleId] = useState('');
  const [hubClientId, setHubClientId] = useState('');
  const [hubClientSecret, setHubClientSecret] = useState('');
  const [hubBaseUrl, setHubBaseUrl] = useState('https://api.cerbos.cloud');
  const [wasmUrl, setWasmUrl] = useState(defaultWasmUrl());

  const [isInitializing, setIsInitializing] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [responseText, setResponseText] = useState('');

  const defaultRequestText = useMemo(
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
            id: '1',
            attr: { owner: 'user@example.com' },
          },
          actions: ['view', 'edit'],
          includeMetadata: true,
        },
        null,
        2,
      ),
    [],
  );

  const [requestText, setRequestText] = useState(defaultRequestText);

  const init = async () => {
    if (!ruleId.trim()) {
      Alert.alert('Missing rule ID', 'Enter a Cerbos Hub rule ID to initialize the embedded client.');
      return;
    }

    setIsInitializing(true);
    setResponseText('');
    try {
      await webViewRef.current?.init({
        ruleId: ruleId.trim(),
        hubClientId: hubClientId.trim() || undefined,
        hubClientSecret: hubClientSecret.trim() || undefined,
        hubBaseUrl: hubBaseUrl.trim() || undefined,
        wasmUrl: wasmUrl.trim() || undefined,
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
    setResponseText('');
    try {
      const request = JSON.parse(requestText);
      const result = await webViewRef.current?.checkResource(request);
      setResponseText(JSON.stringify(result, null, 2));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setResponseText(`Error: ${message}`);
    } finally {
      setIsCalling(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.section}>
          <ThemedText type="title">Cerbos Embedded (WebView)</ThemedText>
          <ThemedText style={styles.muted}>
            This screen initializes `@cerbos/embedded-client` inside a WebView and calls `checkResource` via postMessage.
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

          <ThemedText style={styles.label}>WASM URL</ThemedText>
          <TextInput
            style={styles.input}
            value={wasmUrl}
            onChangeText={setWasmUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={defaultWasmUrl()}
          />

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
            <ThemedText type="defaultSemiBold">{isCalling ? 'Calling…' : 'Run checkResource'}</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Result</ThemedText>
          <View style={styles.result}>
            <ThemedText style={styles.resultText}>{responseText || '(no result yet)'}</ThemedText>
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">WebView runtime</ThemedText>
          <ThemedText style={styles.muted}>
            If you don’t see results, ensure the WebView can reach the Hub and the WASM URL on your device/emulator.
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
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multiline: { minHeight: 160 },
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
