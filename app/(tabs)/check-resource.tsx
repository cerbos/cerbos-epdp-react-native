import type { CheckResourceRequest } from '@cerbos/core';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCerbosEpdp } from '@/components/cerbos-epdp-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const defaultCheckResourceJson = JSON.stringify(
  {
    requestId: '7d22d4bf-bffd-4ea1-9725-c7ad086675bb',
    resource: {
      kind: 'app::expense',
      id: 'expense6',
      attr: {
        amount: 20,
        approvedBy: 'frank',
        createdAt: '2025-12-12T11:43:47.701Z',
        ownerId: 'audrey',
        region: 'EMEA',
        status: 'APPROVED',
        vendor: 'Pencils & Co',
      },
      scope: 'ACME',
    },
    principal: {
      id: 'audrey',
      roles: ['USER'],
      attr: {
        department: 'IT',
        name: 'Audrey Auditor',
        organizations: ['ACME'],
        region: 'EMEA',
      },
    },
    actions: ['view', 'view:approver', 'update', 'delete', 'approve'],
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

export default function CheckResourceScreen() {
  const { checkResource } = useCerbosEpdp();

  const [checkResourceJson, setCheckResourceJson] = useState(defaultCheckResourceJson);
  const [isCheckingResource, setIsCheckingResource] = useState(false);
  const [checkResourceResult, setCheckResourceResult] = useState('');

  const onRun = async () => {
    setIsCheckingResource(true);
    setCheckResourceResult('');
    try {
      const request = parseJson<CheckResourceRequest>(checkResourceJson, 'checkResource JSON');
      const result = await checkResource(request);
      setCheckResourceResult(stringify(result));
    } catch (e) {
      setCheckResourceResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCheckingResource(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.section}>
          <ThemedText type="title">checkResource</ThemedText>
          <ThemedText style={styles.muted}>Calls `client.checkResource()` inside the WebView.</ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={checkResourceJson}
            onChangeText={setCheckResourceJson}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
          />

          <Pressable style={[styles.button, isCheckingResource && styles.buttonDisabled]} disabled={isCheckingResource} onPress={onRun}>
            <ThemedText type="defaultSemiBold">{isCheckingResource ? 'Calling…' : 'Run checkResource'}</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Result</ThemedText>
          <View style={styles.result}>
            <ThemedText style={styles.resultText}>{checkResourceResult || '(no result yet)'}</ThemedText>
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
