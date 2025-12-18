import type { CheckResourcesRequest } from '@cerbos/core';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCerbosEpdp } from '@/components/cerbos-epdp-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const defaultCheckResourcesJson = JSON.stringify(
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
);

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

export default function CheckResourcesScreen() {
  const { checkResources } = useCerbosEpdp();

  const [checkResourcesJson, setCheckResourcesJson] = useState(defaultCheckResourcesJson);
  const [isCheckingResources, setIsCheckingResources] = useState(false);
  const [checkResourcesResult, setCheckResourcesResult] = useState('');

  const onRun = async () => {
    setIsCheckingResources(true);
    setCheckResourcesResult('');
    try {
      const request = parseJson<CheckResourcesRequest>(checkResourcesJson, 'checkResources JSON');
      const result = await checkResources(request);
      setCheckResourcesResult(stringify(result));
    } catch (e) {
      setCheckResourcesResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCheckingResources(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.section}>
          <ThemedText type="title">checkResources</ThemedText>
          <ThemedText style={styles.muted}>Calls `client.checkResources()` inside the WebView.</ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={checkResourcesJson}
            onChangeText={setCheckResourcesJson}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
          />

          <Pressable style={[styles.button, isCheckingResources && styles.buttonDisabled]} disabled={isCheckingResources} onPress={onRun}>
            <ThemedText type="defaultSemiBold">{isCheckingResources ? 'Calling…' : 'Run checkResources'}</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Result</ThemedText>
          <View style={styles.result}>
            <ThemedText style={styles.resultText}>{checkResourcesResult || '(no result yet)'}</ThemedText>
          </View>
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 16, gap: 16 },
  section: { gap: 10, padding: 12, borderRadius: 12 },
  muted: { fontSize: 12, opacity: 0.7 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multiline: { minHeight: 220 },
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
});
