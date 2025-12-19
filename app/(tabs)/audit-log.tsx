import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCerbosEpdp } from '@/components/cerbos-epdp-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function AuditLogScreen() {
  const { decisionLog, clearDecisionLog, eventLog, clearEventLog } = useCerbosEpdp();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.section}>
          <ThemedText type="title">Decision Log</ThemedText>
          <ThemedText style={styles.muted}>
            Entries come from the embedded client `onDecision` callback (enable it in the ePDP tab).
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <Pressable style={styles.button} onPress={clearDecisionLog}>
            <ThemedText type="defaultSemiBold">Clear</ThemedText>
          </Pressable>
        </ThemedView>

        {decisionLog.length === 0 ? (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.muted}>(no entries yet)</ThemedText>
          </ThemedView>
        ) : (
          decisionLog.map((item, idx) => (
            <ThemedView key={`${item.ts}-${idx}`} style={styles.section}>
              <ThemedText type="defaultSemiBold">{new Date(item.ts).toISOString()}</ThemedText>
              <View style={styles.result}>
                <ThemedText style={styles.resultText}>{safeStringify(item.entry)}</ThemedText>
              </View>
            </ThemedView>
          ))
        )}

        <ThemedView style={styles.section}>
          <ThemedText type="title">Other Events</ThemedText>
          <Pressable style={styles.button} onPress={clearEventLog}>
            <ThemedText type="defaultSemiBold">Clear</ThemedText>
          </Pressable>
        </ThemedView>

        {eventLog.length === 0 ? (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.muted}>(no events yet)</ThemedText>
          </ThemedView>
        ) : (
          eventLog.map((item, idx) => (
            <ThemedView key={`${item.ts}-${idx}`} style={styles.section}>
              <ThemedText type="defaultSemiBold">
                {new Date(item.ts).toISOString()} • {item.type}
              </ThemedText>
              <View style={styles.result}>
                <ThemedText style={styles.resultText}>{safeStringify(item.payload)}</ThemedText>
              </View>
            </ThemedView>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 16, gap: 16 },
  section: { gap: 10, padding: 12, borderRadius: 12 },
  muted: { fontSize: 12, opacity: 0.7 },
  button: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#e6e6e6',
  },
  result: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    borderRadius: 10,
    padding: 12,
  },
  resultText: { fontSize: 12, lineHeight: 18 },
});
