import type { Options as EmbeddedClientOptions, PolicyLoaderOptions } from '@cerbos/embedded-client';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCerbosEpdp } from '@/components/cerbos-epdp-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const defaultEmbeddedOptionsJson = JSON.stringify(
  {
    schemaEnforcement: 'warn',
    lenientScopeSearch: true,
  },
  null,
  2,
);

const defaultPolicyOptionsJson = JSON.stringify(
  {
    scopes: [],
    activateOnLoad: true,
    interval: 60,
  },
  null,
  2,
);

function parseJson<T>(input: string, label: string): T {
  try {
    return JSON.parse(input) as T;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`${label} is not valid JSON: ${message}`);
  }
}

export default function EpdpConfigScreen() {
  const { init } = useCerbosEpdp();

  const [ruleId, setRuleId] = useState('AVGB9RP6HFBL');
  const [hubClientId, setHubClientId] = useState('');
  const [hubClientSecret, setHubClientSecret] = useState('');
  const [hubBaseUrl, setHubBaseUrl] = useState('https://api.cerbos.cloud');
  const [embeddedOptionsJson, setEmbeddedOptionsJson] = useState(defaultEmbeddedOptionsJson);
  const [policyOptionsJson, setPolicyOptionsJson] = useState(defaultPolicyOptionsJson);
  const [enableOnDecision, setEnableOnDecision] = useState(true);
  const [enableOnValidationError, setEnableOnValidationError] = useState(false);
  const [enableDecodeJwtPayload, setEnableDecodeJwtPayload] = useState(false);
  const [enablePolicyOnUpdate, setEnablePolicyOnUpdate] = useState(false);

  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState('');
  const [initSuccess, setInitSuccess] = useState('');

  const onInit = async () => {
    setIsInitializing(true);
    setInitError('');
    setInitSuccess('');
    try {
      const options = parseJson<
        Partial<
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
        >
      >(embeddedOptionsJson || '{}', 'Embedded options JSON');

      const policyOptions = parseJson<Partial<Pick<PolicyLoaderOptions, 'scopes' | 'activateOnLoad' | 'interval'>>>(
        policyOptionsJson || '{}',
        'Policy options JSON',
      );

      await init({
        ruleId,
        hubClientId,
        hubClientSecret,
        hubBaseUrl,
        options,
        policyOptions,
        enableOnDecision,
        enableOnValidationError,
        enableDecodeJwtPayload,
        enablePolicyOnUpdate,
      });
      setInitSuccess(`Initialized at ${new Date().toISOString()}`);
      Alert.alert('Initialized', 'ePDP initialized inside the WebView.');
    } catch (e) {
      setInitError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.section}>
          <ThemedText type="title">ePDP</ThemedText>
          <ThemedText style={styles.muted}>Configure and initialize the embedded Cerbos PDP running inside the WebView.</ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Hub</ThemedText>

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
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Options</ThemedText>

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
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Callbacks</ThemedText>

          <View style={styles.toggleRow}>
            <ThemedText>onDecision (decision log)</ThemedText>
            <Switch value={enableOnDecision} onValueChange={setEnableOnDecision} />
          </View>
          <View style={styles.toggleRow}>
            <ThemedText>onValidationError (event log)</ThemedText>
            <Switch value={enableOnValidationError} onValueChange={setEnableOnValidationError} />
          </View>
          <View style={styles.toggleRow}>
            <ThemedText>decodeJWTPayload</ThemedText>
            <Switch value={enableDecodeJwtPayload} onValueChange={setEnableDecodeJwtPayload} />
          </View>
          <View style={styles.toggleRow}>
            <ThemedText>policy onUpdate</ThemedText>
            <Switch value={enablePolicyOnUpdate} onValueChange={setEnablePolicyOnUpdate} />
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <Pressable style={[styles.button, isInitializing && styles.buttonDisabled]} disabled={isInitializing} onPress={onInit}>
            <ThemedText type="defaultSemiBold">{isInitializing ? 'Initializing…' : 'Init ePDP'}</ThemedText>
          </Pressable>
          {!!initError && <ThemedText style={styles.error}>{initError}</ThemedText>}
          {!!initSuccess && <ThemedText style={styles.success}>{initSuccess}</ThemedText>}
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
  error: { fontSize: 12, color: '#b00020' },
  success: { fontSize: 12, color: '#0a7ea4' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multilineSmall: { minHeight: 120 },
  button: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#e6e6e6',
  },
  buttonDisabled: { opacity: 0.6 },
});
