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

// Define the shape of the context provided to consumers
interface CerbosContextType {
  isLoaded: boolean; // Indicates if the PDP bundle has been loaded at least once
  pdpLoadedAt: Date | undefined; // Timestamp of the last successful PDP bundle load
  checkResources: (
    request: Omit<CheckResourcesRequest, "requestId">
  ) => Promise<CheckResourcesResponse>; // Function to authorize resources
}

// Create the Cerbos context with default values
const CerbosContext = createContext<CerbosContextType>({
  isLoaded: false,
  pdpLoadedAt: undefined,
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
  refreshIntervalSeconds = 60,
  requestTimeout = 2000,
  batchInterval = 50,
  maxBatchSize = 10,
}) => {
  // State indicating if the WebView has loaded the initial PDP bundle
  const [isReady, setIsReady] = useState(false);
  // State storing the timestamp of the last successful PDP bundle load
  const [pdpLoadedAt, setPDPLoadedAt] = useState<Date | undefined>(undefined);
  // State holding pending checkResources requests (including promise handlers)
  const [requests, setRequests] = useState<PDPRequests>({});
  // State holding the batch of requests currently being processed by the WebView
  const [batchedRequests, setBatchedRequests] =
    useState<SerializablePDPRequests>({});

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
      pdpLoadedAt,
      isLoaded: isReady,
    }),
    [checkResources, pdpLoadedAt, isReady] // Dependencies for the context value
  );

  return (
    <CerbosContext.Provider value={contextValue}>
      {children}
      {/* Render the WebView component, hidden from the user */}
      {/* It handles the actual PDP loading and request execution */}
      <View style={{ height: 0, width: 0, opacity: 0 }}>
        <CerbosEmbeddedPDPWebView
          url={pdpUrl}
          refreshIntervalSeconds={refreshIntervalSeconds}
          // Callback to update the readiness state when the PDP is loaded/updated
          handlePDPUpdated={() => {
            console.log("[CerbosProvider] PDP bundle updated.");
            setPDPLoadedAt(new Date()); // Update timestamp
            if (!isReady) {
              setIsReady(true); // Set ready state on first load
            }
          }}
          // Pass the current batch of requests to the WebView
          requests={batchedRequests}
          // Pass callback handlers for responses and errors
          handleResponse={handleResponse}
          handleError={handleError}
          // Callback to set initial readiness (legacy, handlePDPUpdated is preferred)
          loaded={setIsReady}
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
