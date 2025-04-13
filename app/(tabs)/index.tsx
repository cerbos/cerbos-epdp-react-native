import { Button, Image, StyleSheet } from "react-native";

import { HelloWave } from "@/components/HelloWave";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useCerbos } from "@/components/CerbosContext";
import { useState } from "react";

export default function HomeScreen() {
  const [num, setNum] = useState(0);
  const { isLoaded } = useCerbos();

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#A1CEDC", dark: "#1D3D47" }}
      headerImage={
        <Image
          source={require("@/assets/images/partial-react-logo.png")}
          style={styles.reactLogo}
        />
      }
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">ePDP Demo</ThemedText>
        <HelloWave />
      </ThemedView>

      {/* Display Cerbos PDP loading state */}
      {!isLoaded && (
        <ThemedView style={styles.stepContainer}>
          <ThemedText type="subtitle" style={{ color: "orange" }}>
            Loading Cerbos PDP...
          </ThemedText>
        </ThemedView>
      )}

      {/* Display error if there is one */}
      {/* {error && (
        <ThemedView style={styles.stepContainer}>
          <ThemedText type="subtitle" style={{ color: "red" }}>
            Error: {error.message}
          </ThemedText>
        </ThemedView>
      )} */}

      {/* Example of how to use the useCerbos hook directly */}
      <ExampleAuthCheck resourceId="example-resource" />
    </ParallaxScrollView>
  );
}

// Example component showing how to use the useCerbos hook directly
function ExampleAuthCheck({ resourceId }: { resourceId: string }) {
  const { checkResources, isLoaded } = useCerbos();
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);

  // Simple function to check if the current user can edit a resource
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
              id: resourceId,
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

      setIsAllowed(result.results[0].isAllowed("read") || false);
    } catch (err) {
      console.error("Auth check failed:", err);
      setIsAllowed(false);
    }
  };

  return (
    <ThemedView style={styles.stepContainer}>
      <ThemedText type="subtitle">Direct Hook Usage Example</ThemedText>
      <Button
        title="Check Edit Permission"
        onPress={checkAccess}
        disabled={!isLoaded}
      />
      {isAllowed !== null && (
        <ThemedText
          style={{
            color: isAllowed ? "#43A047" : "#E53935",
            marginTop: 8,
          }}
        >
          Can edit: {isAllowed ? "Yes" : "No"}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: "absolute",
  },
});
