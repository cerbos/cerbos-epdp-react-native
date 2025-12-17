import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useCerbosEpdp } from '@/components/cerbos-epdp-context';

export default function EpdpConfigScreen() {
  const {
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
  } = useCerbosEpdp();

  const onInit = async () => {
    const ok = await init();
    if (ok) {
      Alert.alert('Initialized', 'ePDP initialized inside the WebView.');
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
            <ThemedText>onValidationError (set onValidationError: {'"callback"'})</ThemedText>
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
