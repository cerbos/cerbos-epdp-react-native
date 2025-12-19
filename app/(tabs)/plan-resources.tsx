import type { PlanResourcesRequest } from '@cerbos/core';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCerbosEpdp } from '@/components/cerbos-epdp-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const defaultPlanResourcesJson = JSON.stringify(
  {
    requestId: 'cc60fdc4-913d-4809-ad2f-55c1506c4f8c',
    action: 'view',
    actions: ['view'],
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
    resource: {
      kind: 'app::expense',
      scope: 'ACME',
    },
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

export default function PlanResourcesScreen() {
  const { planResources } = useCerbosEpdp();

  const [planResourcesJson, setPlanResourcesJson] = useState(defaultPlanResourcesJson);
  const [isPlanningResources, setIsPlanningResources] = useState(false);
  const [planResourcesResult, setPlanResourcesResult] = useState('');

  const onRun = async () => {
    setIsPlanningResources(true);
    setPlanResourcesResult('');
    try {
      const request = parseJson<PlanResourcesRequest>(planResourcesJson, 'planResources JSON');
      const result = await planResources(request);
      setPlanResourcesResult(stringify(result));
    } catch (e) {
      setPlanResourcesResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsPlanningResources(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.section}>
          <ThemedText type="title">planResources</ThemedText>
          <ThemedText style={styles.muted}>Calls `client.planResources()` inside the WebView.</ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={planResourcesJson}
            onChangeText={setPlanResourcesJson}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
          />

          <Pressable style={[styles.button, isPlanningResources && styles.buttonDisabled]} disabled={isPlanningResources} onPress={onRun}>
            <ThemedText type="defaultSemiBold">{isPlanningResources ? 'Calling…' : 'Run planResources'}</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Result</ThemedText>
          <View style={styles.result}>
            <ThemedText style={styles.resultText}>{planResourcesResult || '(no result yet)'}</ThemedText>
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
