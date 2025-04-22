import { useCerbos } from "@/components/CerbosContext";
import { PrincipalPicker } from "@/components/PrincipalPicker";
import { ResourcePicker } from "@/components/ResourcePicker";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { principals, resources } from "@/constants/data";
import {
  CheckResourcesResponse,
  Principal,
  Resource,
} from "@cerbos/core/src/types/external";

import { useEffect, useState } from "react";
import { Button, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  const { isLoaded, metadata } = useCerbos(); // Access Cerbos context
  const [principal, setPrincipal] = useState<Principal>(principals[0]); // Selected principal
  const [resource, setResource] = useState<Resource>(resources[0]); // Selected resource

  return (
    <ScrollView style={{ flex: 1 }}>
      <SafeAreaView>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">Cerbos ePDP Demo</ThemedText>
        </ThemedView>

        {/* Dropdowns for selecting principal and resource */}
        <ThemedView style={styles.dropdownContainer}>
          <PrincipalPicker principal={principal} setPrincipal={setPrincipal} />
          <ResourcePicker resource={resource} setResource={setResource} />
        </ThemedView>

        {/* Cerbos PDP loading state */}
        {!isLoaded && <ThemedText>Loading Cerbos PDP...</ThemedText>}

        {/* Authorization check example */}
        <SampleAuthCheck
          principal={principal}
          resource={resource}
          actions={["create", "read", "update", "delete"]}
        />

        {/* Display PDP load timestamp */}
        {metadata && (
          <>
            <ThemedText style={styles.timestampText}>
              Cerbos PDP loaded at: {metadata.updatedAt}
            </ThemedText>
            <ThemedText style={styles.timestampText}>
              Policy Commit: {metadata.commit}
            </ThemedText>
          </>
        )}
      </SafeAreaView>
    </ScrollView>
  );
}

// Component to perform and display authorization checks
function SampleAuthCheck({
  principal,
  resource,
  actions,
}: {
  principal: Principal;
  resource: Resource;
  actions: string[];
}) {
  const { checkResources, isLoaded } = useCerbos(); // Access Cerbos context
  const [result, setResult] = useState<CheckResourcesResponse | null>(null);

  // Function to check permissions
  const checkAccess = async () => {
    try {
      const result = await checkResources({
        principal,
        resources: [{ resource, actions }],
      });
      console.log("[App] Auth check result:", JSON.stringify(result));
      setResult(result);
    } catch (err) {
      console.error("[App] Auth check failed:", err);
      setResult(null);
    }
  };

  // Reset result when principal or resource changes
  useEffect(() => {
    setResult(null);
  }, [principal, resource]);

  return (
    <ThemedView style={styles.stepContainer}>
      <Button
        title="Check Permissions"
        onPress={checkAccess}
        disabled={!isLoaded}
      />
      {actions.map((action) => (
        <ThemedView style={styles.actionRow} key={action}>
          <ThemedText>{action}:</ThemedText>
          {result ? (
            result.isAllowed({ resource, action }) ? (
              <ThemedText style={styles.allowedText}>Allowed</ThemedText>
            ) : (
              <ThemedText style={styles.deniedText}>Denied</ThemedText>
            )
          ) : (
            <ThemedText>-</ThemedText>
          )}
        </ThemedView>
      ))}
    </ThemedView>
  );
}

// Styles for the component
const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    gap: 8,
    padding: 16,
  },
  dropdownContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
  },

  stepContainer: {
    gap: 8,
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  allowedText: {
    color: "#43A047",
  },
  deniedText: {
    color: "#E53935",
  },
  timestampText: {
    fontSize: 12,
    textAlign: "center",
  },
});
