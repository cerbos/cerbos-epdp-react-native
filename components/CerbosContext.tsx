import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import CerbosEmbeddedPDPWebView from "./CerbosEmbeddedPDPWebView";
import { CheckResourcesRequest } from "@cerbos/core/src/types/external/CheckResourcesRequest";
import { CheckResourcesResponse as CheckResourcesResponsePB } from "@cerbos/embedded/lib/protobuf/cerbos/response/v1/response";
import { CheckResourcesResponse } from "@cerbos/core/src/types/external/CheckResourcesResponse";
import { checkResourcesResponseFromProtobuf } from "@cerbos/core/src/convert/fromProtobuf";
import uuid from "react-native-uuid";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { BundleMetadata } from "@cerbos/embedded";
import { DecisionLogEntry } from "@cerbos/core";

// Define the shape of the context provided to consumers
interface CerbosContextType {
  isLoaded: boolean; // Indicates if the PDP bundle has been loaded at least once
  metadata: PDPMetaData | undefined; // Timestamp of the last successful PDP bundle load
  checkResources: (
    request: Omit<CheckResourcesRequest, "requestId">
  ) => Promise<CheckResourcesResponse>; // Function to authorize resources
}

type PDPMetaData = { updatedAt: string } & BundleMetadata;

// Create the Cerbos context with default values
const CerbosContext = createContext<CerbosContextType>({
  isLoaded: false,
  metadata: undefined,
  checkResources: async () => {
    // Default implementation throws an error if used outside a provider
    throw new Error("Cerbos PDP not initialized");
  },
});

// Define the props for the CerbosProvider component
interface CerbosProviderProps {
  children: ReactNode; // Child components that will consume the context
  pdpUrl: string; // URL to fetch the policy bundle from
  refreshIntervalSeconds?: number; // How often to check for bundle updates (default: 60s)
  requestTimeout?: number; // Max time to wait for a checkResources response (default: 2000ms)
  batchInterval?: number; // Time to wait before sending a batch of requests (default: 50ms)
  maxBatchSize?: number; // Max number of requests per batch (default: 10)
  onDecision?: (decision: DecisionLogEntry) => void; // Callback for decision logs
}

// Structure to hold pending checkResources requests along with their promise handlers
interface PendingRequest {
  request: CheckResourcesRequest; // The original request data
  resolve: (value: CheckResourcesResponse) => void; // Promise resolve function
  reject: (reason?: any) => void; // Promise reject function
  createdAt: number; // Timestamp when the request was created (for debugging/timeouts)
}
// Type for the state holding all pending requests, keyed by request ID
export type PDPRequests = Record<string, PendingRequest>;

// Type for the requests object passed to the WebView (serializable)
export type SerializablePDPRequests = Record<string, CheckResourcesRequest>;

// The CerbosProvider component manages the PDP lifecycle and request handling
export const CerbosProvider: React.FC<CerbosProviderProps> = ({
  children,
  pdpUrl,
  refreshIntervalSeconds = 300,
  requestTimeout = 2000,
  batchInterval = 50,
  maxBatchSize = 10,
  onDecision,
}) => {
  // State indicating if the WebView has loaded the initial PDP bundle
  const [isReady, setIsReady] = useState(false);
  // State storing the timestamp of the last successful PDP bundle load
  const [metadata, setMetadata] = useState<PDPMetaData | undefined>(undefined);
  // State holding pending checkResources requests (including promise handlers)
  const [requests, setRequests] = useState<PDPRequests>({});
  // State holding the batch of requests currently being processed by the WebView
  const [batchedRequests, setBatchedRequests] =
    useState<SerializablePDPRequests>({});

  const [pdpBase64, setPdpBase64] = useState<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    console.log("[CerbosProvider] Initial fetchAsset effect running.");
    fetchAsset(pdpUrl)
      .then(async (localUri) => {
        if (!mounted) {
          console.log(
            "[CerbosProvider] Initial fetchAsset completed but component unmounted."
          );
          return;
        }
        console.log(
          "[CerbosProvider] Initial PDP bundle downloaded/verified at:",
          localUri
        );
        try {
          const b64 = await FileSystem.readAsStringAsync(localUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          console.log(
            `[CerbosProvider] Initial PDP Base64 loaded (Length: ${b64.length}). Setting state.`
          );
          setPdpBase64(b64);
        } catch (readError) {
          console.error(
            "[CerbosProvider] Error reading initial PDP bundle:",
            readError
          );
        }
      })
      .catch((err) =>
        console.error("[CerbosProvider] Error during initial fetchAsset:", err)
      );

    return () => {
      console.log("[CerbosProvider] Initial fetchAsset effect cleanup.");
      mounted = false;
    };
  }, [pdpUrl]);

  useEffect(() => {
    console.log(
      `[CerbosProvider] Setting up periodic PDP update check (${refreshIntervalSeconds}s interval).`
    );
    const intervalId = setInterval(async () => {
      console.log("[CerbosProvider] Periodic update check running...");
      try {
        const localUri = await fetchAsset(pdpUrl);
        console.log(
          "[CerbosProvider] Periodic check: Asset fetched/verified at:",
          localUri
        );
        const newB64 = await FileSystem.readAsStringAsync(localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        setPdpBase64((currentB64) => {
          if (newB64 !== currentB64) {
            console.log(
              `[CerbosProvider] Periodic check: PDP bundle changed (New length: ${newB64.length}). Updating base64 state.`
            );
            return newB64;
          } else {
            console.log(
              "[CerbosProvider] Periodic check: PDP bundle unchanged."
            );
            return currentB64;
          }
        });
      } catch (err) {
        console.error(
          "[CerbosProvider] Error during periodic fetchAsset/read:",
          err
        );
      }
    }, refreshIntervalSeconds * 1000);

    return () => {
      console.log("[CerbosProvider] Clearing periodic PDP update interval.");
      clearInterval(intervalId);
    };
  }, [pdpUrl]);

  // Refs for managing timeouts, batching, and stats
  const activeTimeouts = useRef<Record<string, NodeJS.Timeout>>({}); // Stores active setTimeout IDs for request timeouts
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null); // Stores the setTimeout ID for the next batch processing
  const isBatchingRef = useRef<boolean>(false); // Flag to prevent concurrent batch processing runs
  const stats = useRef({
    // Internal statistics for monitoring
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    timedOutRequests: 0,
    batchesSent: 0,
  });

  // Debugging effect to log the request queue size when it changes
  useEffect(() => {
    const requestCount = Object.keys(requests).length;
    if (requestCount > 0) {
      console.debug(
        `[CerbosProvider] Request queue size changed: ${requestCount}`
      );
    }
  }, [requests]);

  // Callback function to clean up a request after it's resolved, rejected, or timed out
  const cleanupRequest = useCallback(
    (requestId: string, status: "success" | "failure" | "timeout") => {
      console.debug(
        `[CerbosProvider] Cleaning up request ${requestId} (Status: ${status})`
      );

      // Update internal statistics based on the outcome
      if (status === "success") stats.current.successfulRequests++;
      if (status === "failure") stats.current.failedRequests++;
      if (status === "timeout") stats.current.timedOutRequests++;

      // Remove the request from the main pending requests state
      setRequests((prev) => {
        const { [requestId]: _, ...remaining } = prev;
        return remaining;
      });

      // Remove the request from the batched requests state if it's there
      setBatchedRequests((prev) => {
        const { [requestId]: _, ...remaining } = prev;
        return remaining;
      });

      // Clear and remove the timeout associated with this request
      if (activeTimeouts.current[requestId]) {
        clearTimeout(activeTimeouts.current[requestId]);
        delete activeTimeouts.current[requestId];
      }
    },
    [] // No dependencies, this function relies only on refs and setState updaters
  );

  // Callback function to process the next batch of requests
  const processBatch = useCallback(() => {
    // Prevent concurrent processing of batches
    if (isBatchingRef.current) {
      console.debug("[CerbosProvider] Batch processing already in progress.");
      return;
    }

    setRequests((currentRequests) => {
      const pendingRequestIds = Object.keys(currentRequests);

      // If no requests are pending, exit early
      if (pendingRequestIds.length === 0) {
        return currentRequests; // No state change needed
      }

      // Mark batching as active
      isBatchingRef.current = true;

      // Select requests for the current batch, up to maxBatchSize
      const batchEntries = Object.entries(currentRequests).slice(
        0,
        maxBatchSize
      );

      // Prepare the serializable batch to send to the WebView
      const newBatch: SerializablePDPRequests = {};
      batchEntries.forEach(([id, pendingRequest]) => {
        newBatch[id] = pendingRequest.request;
      });

      // Update the batchedRequests state, triggering the WebView to process them
      setBatchedRequests((prev) => {
        stats.current.batchesSent++;
        console.log(
          `[CerbosProvider] Sending batch #${stats.current.batchesSent} with ${
            Object.keys(newBatch).length
          } requests to WebView.`
        );
        // Add the new batch to any existing batched requests (though ideally, prev should be empty)
        return { ...prev, ...newBatch };
      });

      // Reset the batching flag after a short delay.
      // This gives the WebView time to pick up the new `batchedRequests` prop.
      // Adjust delay if needed based on WebView performance.
      setTimeout(() => {
        isBatchingRef.current = false;
        console.debug("[CerbosProvider] Batch processing flag reset.");

        // If there are more requests remaining than the batch size, schedule the next batch immediately.
        if (pendingRequestIds.length > maxBatchSize) {
          console.debug(
            "[CerbosProvider] More requests pending, scheduling next batch."
          );
          if (batchTimerRef.current) {
            clearTimeout(batchTimerRef.current); // Clear any existing timer
          }
          // Use setTimeout for the next batch to avoid deep recursion and allow UI updates
          batchTimerRef.current = setTimeout(processBatch, batchInterval);
        }
      }, 100); // Small delay before allowing the next batch

      // Return the current state; requests are removed only upon response/timeout/error
      return currentRequests;
    });
  }, [maxBatchSize, batchInterval]); // Dependencies: batch configuration

  // Effect to trigger batch processing when new requests arrive
  useEffect(() => {
    const requestCount = Object.keys(requests).length;

    // If there are requests, no batch timer is currently set, and not currently batching
    if (requestCount > 0 && !batchTimerRef.current && !isBatchingRef.current) {
      console.debug(
        `[CerbosProvider] Scheduling batch processing in ${batchInterval}ms.`
      );
      // Schedule the batch processing after the configured interval
      batchTimerRef.current = setTimeout(() => {
        batchTimerRef.current = null; // Clear the ref once the timer fires
        processBatch();
      }, batchInterval);
    }

    // Cleanup function: clear the batch timer if the component unmounts
    // or if dependencies change before the timer fires.
    return () => {
      if (batchTimerRef.current) {
        console.debug("[CerbosProvider] Clearing scheduled batch timer.");
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
    };
  }, [requests, processBatch, batchInterval]); // Dependencies: requests queue, batch function, interval

  // Public function exposed via context to make authorization checks
  const checkResources = useCallback(
    (
      requestData: Omit<CheckResourcesRequest, "requestId">
    ): Promise<CheckResourcesResponse> => {
      // Reject immediately if the PDP is not yet ready
      if (!isReady) {
        console.warn(
          "[CerbosProvider] PDP not ready. Rejecting checkResources call."
        );
        return Promise.reject(new Error("Cerbos PDP not initialized"));
      }

      stats.current.totalRequests++; // Increment total request count
      const requestId = uuid.v4() as string; // Generate a unique ID for the request
      const requestWithId: CheckResourcesRequest = {
        ...requestData,
        requestId: requestId,
      };
      console.log(`[CerbosProvider] Queuing request: ${requestId}`);

      // Return a new promise that will be resolved/rejected when the response arrives or times out
      return new Promise<CheckResourcesResponse>((resolve, reject) => {
        // Set up a timeout for this specific request
        const timeoutId = setTimeout(() => {
          console.warn(
            `[CerbosProvider] Request ${requestId} timed out after ${requestTimeout}ms.`
          );

          // Use the state updater function for safe access to the latest state
          setRequests((currentRequests) => {
            // Check if the request is still pending (it might have been resolved/rejected already)
            if (currentRequests[requestId]) {
              // Reject the promise associated with this request
              currentRequests[requestId].reject(
                new Error(
                  `Request ${requestId} timed out after ${requestTimeout}ms`
                )
              );

              // Clean up the request state and associated timeout
              cleanupRequest(requestId, "timeout");

              // Return the updated state without the timed-out request
              const { [requestId]: _, ...remaining } = currentRequests;
              return remaining;
            }
            // If the request is not found, it means it was already processed. No state change needed.
            return currentRequests;
          });
        }, requestTimeout);

        // Store the timeout ID so it can be cleared later
        activeTimeouts.current[requestId] = timeoutId;

        // Add the new request to the pending requests state
        setRequests((prev) => {
          console.debug(
            `[CerbosProvider] Added request ${requestId} to queue. Queue size: ${
              Object.keys(prev).length + 1
            }`
          );
          return {
            ...prev,
            [requestId]: {
              request: requestWithId,
              resolve, // Store the promise resolve function
              reject, // Store the promise reject function
              createdAt: Date.now(), // Store creation time for debugging/timing
            },
          };
        });
        // Note: The useEffect hook watching `requests` will trigger batch processing if needed.
      });
    },
    [isReady, requestTimeout, cleanupRequest] // Dependencies: readiness flag, timeout config, cleanup function
  );

  // Callback function passed to the WebView, invoked when a response is received
  const handleResponse = useCallback(
    (responsePB: CheckResourcesResponsePB): void => {
      const requestId = responsePB.requestId;
      console.log(
        `[CerbosProvider] Received response from WebView for request: ${requestId}`
      );

      // Find the corresponding pending request
      const pendingRequest = requests[requestId];

      if (pendingRequest) {
        const processingTime = Date.now() - pendingRequest.createdAt;
        console.debug(
          `[CerbosProvider] Processing response for ${requestId} (Total time: ${processingTime}ms)`
        );

        try {
          // Convert the Protobuf response to the standard JS type
          const response = checkResourcesResponseFromProtobuf(responsePB);
          // Resolve the promise associated with this request
          pendingRequest.resolve(response);
          // Clean up the request state
          cleanupRequest(requestId, "success");
        } catch (error) {
          console.error(
            `[CerbosProvider] Error converting Protobuf response for ${requestId}:`,
            error
          );
          // Reject the promise if conversion fails
          pendingRequest.reject(error);
          // Clean up the request state
          cleanupRequest(requestId, "failure");
        }
      } else {
        // This might happen if the request timed out just before the response arrived
        console.warn(
          `[CerbosProvider] Received response for unknown or already processed request ID: ${requestId}. Might have timed out.`
        );
        // Attempt to clean up batched request state just in case
        setBatchedRequests((prev) => {
          const { [requestId]: _, ...remaining } = prev;
          return remaining;
        });
      }
    },
    [requests, cleanupRequest] // Dependencies: requests state, cleanup function
  );

  // Callback function passed to the WebView, invoked when an error occurs during processing in the WebView
  const handleError = useCallback(
    (requestId: string, error: Error): void => {
      console.error(
        `[CerbosProvider] Received error from WebView for request ${requestId}:`,
        error.message
      );

      // Find the corresponding pending request
      const pendingRequest = requests[requestId];

      if (pendingRequest) {
        const processingTime = Date.now() - pendingRequest.createdAt;
        console.debug(
          `[CerbosProvider] Processing error for ${requestId} (Total time: ${processingTime}ms)`
        );

        // Reject the promise associated with this request
        pendingRequest.reject(error);
        // Clean up the request state
        cleanupRequest(requestId, "failure");
      } else {
        // This might happen if the request timed out just before the error was reported
        console.warn(
          `[CerbosProvider] Received error for unknown or already processed request ID: ${requestId}. Might have timed out.`,
          error.message
        );
        // Attempt to clean up batched request state just in case
        setBatchedRequests((prev) => {
          const { [requestId]: _, ...remaining } = prev;
          return remaining;
        });
      }
    },
    [requests, cleanupRequest] // Dependencies: requests state, cleanup function
  );

  // Memoize the context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(
    () => ({
      checkResources,
      metadata,
      isLoaded: isReady,
    }),
    [checkResources, metadata, isReady] // Dependencies for the context value
  );

  // Log when the provider is rendering and whether the PDP base64 is ready
  useEffect(() => {
    console.debug(
      `[CerbosProvider] Rendering. PDP Base64 ready: ${!!pdpBase64}`
    );
  }, [pdpBase64]);

  if (!pdpBase64) {
    // If the local PDP bundle is not yet loaded, show a loading indicator
    console.log("[CerbosProvider] Waiting for PDP base64 data...");
    return (
      <ThemedView>
        <ThemedText>Loading Cerbos ePDP...</ThemedText>
      </ThemedView>
    );
  }

  // Log before rendering the WebView component
  console.debug(
    `[CerbosProvider] Rendering CerbosEmbeddedPDPWebView. isReady: ${isReady}, Batched requests count: ${
      Object.keys(batchedRequests).length
    }`
  );

  return (
    <CerbosContext.Provider value={contextValue}>
      {children}
      {/* Render the WebView component, hidden from the user */}
      {/* It handles the actual PDP loading and request execution */}
      <View style={{ height: 0, width: 0, opacity: 0 }}>
        <CerbosEmbeddedPDPWebView
          // Pass the base64 encoded PDP bundle
          pdpb64={pdpBase64}
          // Pass the refresh interval
          refreshIntervalSeconds={refreshIntervalSeconds}
          // Callback invoked by WebView when the PDP bundle is loaded or updated
          handlePDPUpdated={(meta: PDPMetaData) => {
            console.log(
              "[CerbosProvider] handlePDPUpdated callback invoked by WebView.",
              meta
            );
            setMetadata(meta); // Update timestamp
            if (!isReady) {
              console.log(
                "[CerbosProvider] Setting isReady to true via handlePDPUpdated."
              );
              setIsReady(true); // Set ready state on first load
            }
          }}
          // Pass the current batch of requests to the WebView for processing
          requests={batchedRequests}
          // Pass callback handler for successful responses from the WebView
          handleResponse={handleResponse}
          // Pass callback handler for errors occurring within the WebView
          handleError={handleError}
          // Legacy callback invoked by WebView when it considers itself loaded (use handlePDPUpdated preferably)
          loaded={(loadedState: boolean) => {
            console.log(
              `[CerbosProvider] 'loaded' callback invoked by WebView with state: ${loadedState}. Current isReady: ${isReady}`
            );
            // Ensure we only set readiness to true, and don't unset it via this legacy callback if handlePDPUpdated already set it.
            if (loadedState && !isReady) {
              console.log(
                "[CerbosProvider] Setting isReady to true via legacy 'loaded' callback."
              );
              setIsReady(true);
            } else if (!loadedState && isReady) {
              console.warn(
                "[CerbosProvider] Legacy 'loaded' callback reported false, but provider is already ready. Ignoring."
              );
            }
            // We might consider setting isReady to false if loadedState is false *and* pdpLoadedAt is undefined,
            // but handlePDPUpdated is the primary mechanism now.
          }}
          // Pass callback handler for decision logs (if needed)
          handleDecisionLog={onDecision}
          // DOM props for Expo Web compatibility (can be ignored for native)
          dom={{ style: { height: 0 }, matchContents: false }}
        />
      </View>
    </CerbosContext.Provider>
  );
};

// Custom hook to easily consume the Cerbos context
export const useCerbos = (): CerbosContextType => {
  const context = useContext(CerbosContext);
  // Ensure the hook is used within a CerbosProvider tree
  if (context === undefined) {
    throw new Error("useCerbos must be used within a CerbosProvider");
  }
  return context;
};

export async function fetchAsset(url: string) {
  const filename = "cerbosepdp.wasm";
  const localUri = `${FileSystem.documentDirectory}${filename}`;
  const etagKey = `${url}:etag`;

  // Check connectivity
  const { isConnected } = await NetInfo.fetch();
  const info = await FileSystem.getInfoAsync(localUri); // Check existence early

  if (!isConnected) {
    console.log("[fetchAsset] Offline mode detected.");
    if (info.exists) {
      console.log(
        "[fetchAsset] Offline: Returning existing cached asset:",
        localUri
      );
      return localUri;
    }
    console.error("[fetchAsset] Offline and no cached asset found.");
    throw new Error("Offline and no cached asset");
  }
  console.log("[fetchAsset] Online mode detected.");

  // Retrieve stored ETag
  const storedEtag = await AsyncStorage.getItem(etagKey);
  console.log(`[fetchAsset] Stored ETag: ${storedEtag}`);

  // Prepare headers for conditional GET
  const headers: HeadersInit = {};
  if (storedEtag && info.exists) {
    // Only send If-None-Match if we have an ETag *and* a cached file
    headers["If-None-Match"] = storedEtag;
    console.log(
      `[fetchAsset] Sending GET request with If-None-Match: ${storedEtag}`
    );
  } else {
    console.log(
      "[fetchAsset] Sending unconditional GET request (no ETag or no cached file)."
    );
  }

  try {
    const response = await fetch(url, { method: "GET", headers });
    console.log(`[fetchAsset] GET request status: ${response.status}`);

    if (response.status === 304) {
      // Not Modified
      console.log(
        "[fetchAsset] Received 304 Not Modified. Using cached asset:",
        localUri
      );
      if (!info.exists) {
        console.error(
          "[fetchAsset] Received 304 but cached asset does not exist. Attempting download again."
        );
      } else {
        return localUri; // Asset is unchanged, return cached URI
      }
    }

    if (response.ok) {
      console.log(
        `[fetchAsset] Received status ${response.status}. Downloading asset from ${url} to ${localUri}`
      );
      const downloadResult = await FileSystem.downloadAsync(url, localUri);
      console.log(
        `[fetchAsset] Download complete. Status: ${downloadResult.status}, URI: ${downloadResult.uri}`
      );

      if (downloadResult.status >= 200 && downloadResult.status < 300) {
        const remoteEtag = response.headers.get("ETag");
        console.log(`[fetchAsset] New remote ETag: ${remoteEtag}`);

        if (remoteEtag) {
          console.log(`[fetchAsset] Saving new ETag: ${remoteEtag}`);
          await AsyncStorage.setItem(etagKey, remoteEtag);
        } else {
          if (storedEtag) {
            console.log(
              `[fetchAsset] Removing stored ETag (no longer provided by server).`
            );
            await AsyncStorage.removeItem(etagKey);
          }
        }
        console.log("[fetchAsset] ETag updated/checked in AsyncStorage.");
        return downloadResult.uri;
      } else {
        console.warn(
          `[fetchAsset] FileSystem.downloadAsync failed with status: ${downloadResult.status}`
        );
        if (info.exists) {
          console.warn(
            "[fetchAsset] Download failed, returning previously cached asset:",
            localUri
          );
          return localUri;
        }
        throw new Error(
          `Unable to download asset (download status ${downloadResult.status}) and no cache available`
        );
      }
    } else {
      console.error(
        `[fetchAsset] Initial GET request failed with status: ${response.status}`
      );
      if (info.exists) {
        console.warn(
          `[fetchAsset] GET request failed (status ${response.status}), falling back to cached asset:`,
          localUri
        );
        return localUri;
      }
      throw new Error(
        `GET request failed with status ${response.status} and no cache available`
      );
    }
  } catch (error) {
    console.error("[fetchAsset] Error during fetch/download process:", error);
    if (info.exists) {
      console.warn(
        "[fetchAsset] Network/Download error, falling back to cached asset:",
        localUri
      );
      return localUri;
    }
    throw new Error(
      `Failed to fetch or download asset and no cache available: ${error}`
    );
  }
}
