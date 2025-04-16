import { Button, StyleSheet } from "react-native";

import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import {
  CerbosWasmProvider,
  useCerbosWasm,
} from "@/components/CerbosWasmContext";
import { CERBOS_PDP_URL } from "../_layout";
import { useState } from "react";

export default function TabTwoScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#D0D0D0", dark: "#353636" }}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="chevron.left.forwardslash.chevron.right"
          style={styles.headerImage}
        />
      }
    >
      <CerbosWasmProvider pdpUrl={CERBOS_PDP_URL}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">Explore</ThemedText>
        </ThemedView>
        <ThemedView>
          <ExampleAuthCheck />
        </ThemedView>
      </CerbosWasmProvider>
    </ParallaxScrollView>
  );
}

function ExampleAuthCheck() {
  const { checkResources, loaded } = useCerbosWasm();
  const [authorizationResult, setAuthorizationResult] = useState(false);

  const checkAccess = async () => {
    try {
      const result = await checkResources({
        requestId: "",
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
              id: "123",
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
        includeMeta: false,
      });

      // setAuthorizationResult(result.results[0].isAllowed("read") || false);
    } catch (err) {
      console.error("Auth check failed:", err);
      setAuthorizationResult(false);
    }
  };

  return (
    <ThemedView>
      <ThemedText type="subtitle">Direct Hook Usage Example</ThemedText>

      <ThemedView>
        <Button
          title="Check Edit Permission"
          onPress={checkAccess}
          disabled={!loaded}
        />
        {authorizationResult !== null && (
          <ThemedText
            style={{
              color: authorizationResult ? "#43A047" : "#E53935",
              marginTop: 8,
            }}
          >
            Can edit: {authorizationResult ? "Yes" : "No"}
          </ThemedText>
        )}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: "#808080",
    bottom: -90,
    left: -35,
    position: "absolute",
  },
  titleContainer: {
    flexDirection: "row",
    gap: 8,
  },
});
