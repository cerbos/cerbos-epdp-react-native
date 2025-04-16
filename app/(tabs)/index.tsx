import { useCerbos } from "@/components/CerbosContext";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import {
  CheckResourcesResponse,
  Principal,
  Resource,
} from "@cerbos/core/src/types/external";
import { useEffect, useState } from "react";
import { Button, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SelectDropdown from "react-native-select-dropdown";

const principals: Principal[] = [
  {
    id: "alice",
    roles: ["USER"],
    attr: {},
  },
  {
    id: "sally",
    roles: ["USER"],
    attr: {},
  },
  {
    id: "ian",
    roles: ["ADMIN"],
    attr: {},
  },
];

const resources: Resource[] = [
  {
    kind: "resource",
    id: "doc1",
    attr: {
      ownerId: "sally",
      status: "published",
    },
  },
  {
    kind: "resource",
    id: "doc2",
    attr: {
      ownerId: "alice",
      status: "draft",
    },
  },
  {
    kind: "resource",
    id: "doc3",
    attr: {
      ownerId: "admin",
      status: "published",
    },
  },
];

export default function HomeScreen() {
  const { isLoaded, pdpLoadedAt } = useCerbos();

  const [principal, setPrincipal] = useState<Principal>(principals[0]);
  const [resource, setResource] = useState<Resource>(resources[0]);

  return (
    <ScrollView style={{ flex: 1 }}>
      <SafeAreaView>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">ePDP Demo</ThemedText>
        </ThemedView>
        <ThemedView
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "center",
          }}
        >
          <ThemedView
            style={{
              flex: 1,
              flexDirection: "column",
            }}
          >
            <SelectDropdown
              data={principals.map((p) => ({ title: p.id, value: p }))}
              defaultValue={{ title: principal.id, value: principal }}
              onSelect={(selectedItem, index) => {
                setPrincipal(selectedItem.value);
              }}
              renderButton={(selectedItem, isOpen) => {
                return (
                  <ThemedView style={styles.dropdownButtonStyle}>
                    <ThemedText style={styles.dropdownButtonTxtStyle}>
                      {(selectedItem && selectedItem.title) ||
                        "Select principal"}
                    </ThemedText>
                  </ThemedView>
                );
              }}
              renderItem={(item, index, isSelected) => {
                return (
                  <ThemedView
                    style={{
                      ...styles.dropdownItemStyle,
                      ...(isSelected && { backgroundColor: "#D2D9DF" }),
                    }}
                  >
                    <ThemedText style={styles.dropdownItemTxtStyle}>
                      {item.title}
                    </ThemedText>
                  </ThemedView>
                );
              }}
              showsVerticalScrollIndicator={false}
              dropdownStyle={styles.dropdownMenuStyle}
            />
            <ThemedText
              style={{
                fontSize: 12,
                lineHeight: 16,
                padding: 8,
              }}
            >
              {JSON.stringify(principal, null, 2)}
            </ThemedText>
          </ThemedView>
          <ThemedView>
            <SelectDropdown
              data={resources.map((r) => ({ title: r.id, value: r }))}
              onSelect={(selectedItem, index) => {
                setResource(selectedItem.value);
              }}
              defaultValue={{ title: resource.id, value: resource }}
              renderButton={(selectedItem, isOpen) => {
                return (
                  <ThemedView style={styles.dropdownButtonStyle}>
                    <ThemedText style={styles.dropdownButtonTxtStyle}>
                      {(selectedItem && selectedItem.title) ||
                        "Select resource"}
                    </ThemedText>
                  </ThemedView>
                );
              }}
              renderItem={(item, index, isSelected) => {
                return (
                  <ThemedView
                    style={{
                      ...styles.dropdownItemStyle,
                      ...(isSelected && { backgroundColor: "#D2D9DF" }),
                    }}
                  >
                    <ThemedText style={styles.dropdownItemTxtStyle}>
                      {item.title}
                    </ThemedText>
                  </ThemedView>
                );
              }}
              showsVerticalScrollIndicator={false}
              dropdownStyle={styles.dropdownMenuStyle}
            />
            <ThemedText
              style={{
                fontSize: 12,
                lineHeight: 16,
                padding: 8,
              }}
            >
              {JSON.stringify(resource, null, 2)}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        {/* Display Cerbos PDP loading state */}
        {!isLoaded && <ThemedText>Loading Cerbos PDP...</ThemedText>}

        {/* Example of how to use the useCerbos hook directly */}
        <SampleAuthCheck
          principal={principal}
          resource={resource}
          actions={["create", "read", "update", "delete"]}
        />
        {pdpLoadedAt && (
          <ThemedText style={{ fontSize: 12, textAlign: "center" }}>
            Cerbos PDP loaded at: {pdpLoadedAt.toISOString()}
          </ThemedText>
        )}
      </SafeAreaView>
    </ScrollView>
  );
}

function SampleAuthCheck({
  principal,
  resource,
  actions,
}: {
  principal: Principal;
  resource: Resource;
  actions: string[];
}) {
  const { checkResources, isLoaded } = useCerbos();
  const [result, setResult] = useState<CheckResourcesResponse | null>(null);

  // Simple function to check if the current user can edit a resource
  const checkAccess = async () => {
    try {
      const result = await checkResources({
        principal,
        resources: [
          {
            resource,
            actions,
          },
        ],
      });

      console.log("[App] Auth check result:", JSON.stringify(result));

      setResult(result);
    } catch (err) {
      console.error("Auth check failed:", err);
      setResult(null);
    }
  };

  useEffect(() => {
    setResult(null); // Reset result when principal or resource changes
  }, [principal, resource]);

  return (
    <ThemedView style={styles.stepContainer}>
      <Button
        title="Check Permissions"
        onPress={checkAccess}
        disabled={!isLoaded}
      />
      {actions.map((action) => {
        return (
          <ThemedView style={{ flexDirection: "row", gap: 8 }} key={action}>
            <ThemedText>{action}:</ThemedText>

            {result ? (
              result.isAllowed({ resource, action }) ? (
                <ThemedText
                  style={{
                    color: "#43A047",
                  }}
                >
                  Allowed
                </ThemedText>
              ) : (
                <ThemedText
                  style={{
                    color: "#E53935",
                  }}
                >
                  Denied
                </ThemedText>
              )
            ) : (
              <ThemedText>-</ThemedText>
            )}
          </ThemedView>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    gap: 8,
    padding: 16,
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
  dropdownButtonStyle: {
    width: 175,
    height: 50,
    backgroundColor: "#E9ECEF",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  dropdownButtonTxtStyle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    color: "#151E26",
  },
  dropdownButtonArrowStyle: {
    fontSize: 28,
  },
  dropdownButtonIconStyle: {
    fontSize: 28,
    marginRight: 8,
  },
  dropdownMenuStyle: {
    backgroundColor: "#E9ECEF",
    borderRadius: 8,
  },
  dropdownItemStyle: {
    width: "100%",
    flexDirection: "row",
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
  },
  dropdownItemTxtStyle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    color: "#151E26",
  },
  dropdownItemIconStyle: {
    fontSize: 28,
    marginRight: 8,
  },
});
