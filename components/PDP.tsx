import { StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { useCerbos } from "./CerbosContext";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";
import { Effect } from "@cerbos/embedded/lib/protobuf/cerbos/effect/v1/effect";

export default function CerbosePDP({ someProp }: { someProp: number }) {
  const { isLoaded, checkResources } = useCerbos();
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);

  useEffect(() => {
    const verifyAccess = async () => {
      try {
        setChecking(true);
        const result = await checkResources({
          principal: {
            id: "user123",
            roles: ["USER"],
            attr: {
              age: 30,
              country: "US",
            },
            policyVersion: "",
            scope: "",
          },
          resources: [
            {
              resource: {
                kind: "resource",
                id: "resource123",
                attr: {
                  owner: "user123",
                  status: "active",
                },
                policyVersion: "",
                scope: "",
              },
              actions: ["read"],
            },
          ],
          auxData: undefined,
          requestId: "",
          includeMeta: false,
        });
        console.log("Authorization result:", result);

        setAuthorized(result.results[0].isAllowed("read") || false);
      } catch (err) {
        console.error("Error checking resource:", err);
        setAuthorized(false);
      } finally {
        setChecking(false);
      }
    };

    // Only run the check if the PDP is loaded
    if (!isLoaded) {
      verifyAccess();
    }
  }, [isLoaded, checkResources, someProp]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Cerbos PDP Status</ThemedText>

      {!isLoaded && (
        <ThemedText style={styles.statusText}>Loading PDP...</ThemedText>
      )}

      {/* {error && (
        <ThemedText style={[styles.statusText, styles.errorText]}>
          Error: {error.message}
        </ThemedText>
      )} */}
      {/* 
      {!loading && !error && checking && (
        <ThemedText style={styles.statusText}>
          Checking authorization...
        </ThemedText>
      )} */}

      {isLoaded && (
        <>
          <ThemedView style={styles.resultRow}>
            <ThemedText>Authorization status:</ThemedText>
            <ThemedText
              style={authorized ? styles.successText : styles.errorText}
            >
              {authorized ? "Allowed" : "Denied"}
            </ThemedText>
          </ThemedView>

          <ThemedText style={styles.propText}>
            Props updated: {someProp} time(s)
          </ThemedText>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 8,
    marginVertical: 8,
    gap: 8,
  },
  statusText: {
    marginTop: 8,
  },
  errorText: {
    color: "#E53935",
  },
  successText: {
    color: "#43A047",
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  propText: {
    marginTop: 8,
    fontStyle: "italic",
  },
});
