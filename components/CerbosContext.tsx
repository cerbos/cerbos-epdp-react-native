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

// Define the shape of the context
interface CerbosContextType {
  isLoaded: boolean;
  pdpLoadedAt: Date | undefined;
  checkResources: (
    request: Omit<CheckResourcesRequest, "requestId">
  ) => Promise<CheckResourcesResponse>;
}

// Create a context with a default value
const CerbosContext = createContext<CerbosContextType>({
  isLoaded: false,
  pdpLoadedAt: undefined,
  checkResources: async () => {
    throw new Error("Cerbos PDP not initialized");
  },
});

// Provider props
interface CerbosProviderProps {
  children: ReactNode;
  pdpUrl: string;
  refreshIntervalSeconds?: number;
  requestTimeout?: number; // Optional request timeout in ms
  batchInterval?: number; // Optional batching interval in ms
  maxBatchSize?: number; // Optional maximum batch size
}

// Keep track of pending requests and their promise resolvers
interface PendingRequest {
  request: CheckResourcesRequest;
  resolve: (value: CheckResourcesResponse) => void;
  reject: (reason?: any) => void;
  createdAt: number; // Add timestamp for debugging
}
export type PDPRequests = Record<string, PendingRequest>;

// Type for serializable requests passed to WebView
export type SerializablePDPRequests = Record<string, CheckResourcesRequest>;

// Create the provider component
export const CerbosProvider: React.FC<CerbosProviderProps> = ({
  children,
  pdpUrl,
  refreshIntervalSeconds = 60, // default update interval in seconds
  requestTimeout = 2000, // default timeout to 2 seconds
  batchInterval = 50, // default batch interval to 50ms
  maxBatchSize = 10, // default max batch size to 10 requests
}) => {
  const [isReady, setIsReady] = useState(false);
  const [pdpLoadedAt, setPDPLoadedAt] = useState<Date | undefined>(undefined);
  // Store pending requests with their resolve/reject handlers
  const [requests, setRequests] = useState<PDPRequests>({});
  // Store batched requests that will be passed to WebView
  const [batchedRequests, setBatchedRequests] =
    useState<SerializablePDPRequests>({});
  // Keep track of active timeouts
  const activeTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
  // Batch timer reference
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Track if batch is being processed
  const isBatchingRef = useRef<boolean>(false);
  // Track request statistics
  const stats = useRef({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    timedOutRequests: 0,
    batchesSent: 0,
  });

  // Debug utility for request queue monitoring
  useEffect(() => {
    const requestCount = Object.keys(requests).length;
    if (requestCount > 0) {
      console.log(
        `[CerbosProvider] Current request queue size: ${requestCount}`
      );
    }
  }, [requests]);

  // Function to clean up a request and its timeout
  const cleanupRequest = useCallback(
    (requestId: string, status: "success" | "failure" | "timeout") => {
      console.log(
        `[CerbosProvider] Cleaning up request ${requestId} (${status})`
      );

      // Update stats
      if (status === "success") stats.current.successfulRequests++;
      if (status === "failure") stats.current.failedRequests++;
      if (status === "timeout") stats.current.timedOutRequests++;

      setRequests((prev) => {
        const { [requestId]: _, ...remaining } = prev;
        return remaining;
      });

      // Also remove from batched requests if present
      setBatchedRequests((prev) => {
        const { [requestId]: _, ...remaining } = prev;
        return remaining;
      });

      if (activeTimeouts.current[requestId]) {
        clearTimeout(activeTimeouts.current[requestId]);
        delete activeTimeouts.current[requestId];
      }
    },
    []
  );

  // Process requests in batches
  const processBatch = useCallback(() => {
    if (isBatchingRef.current) {
      return; // Don't process if already processing
    }

    setRequests((currentRequests) => {
      // If no pending requests, do nothing
      if (Object.keys(currentRequests).length === 0) {
        return currentRequests;
      }

      // Mark as processing
      isBatchingRef.current = true;

      // Take up to maxBatchSize requests to process
      const requestEntries = Object.entries(currentRequests);
      const batchEntries = requestEntries.slice(0, maxBatchSize);

      // Create batch for WebView
      const newBatch: SerializablePDPRequests = {};
      batchEntries.forEach(([id, pendingRequest]) => {
        newBatch[id] = pendingRequest.request;
      });

      // Update batched requests
      setBatchedRequests((prev) => {
        stats.current.batchesSent++;
        console.log(
          `[CerbosProvider] Sending batch #${stats.current.batchesSent} with ${
            Object.keys(newBatch).length
          } requests`
        );
        return { ...prev, ...newBatch };
      });

      // Reset batching flag after a small delay to allow WebView to process
      setTimeout(() => {
        isBatchingRef.current = false;

        // Schedule next batch if there are still requests
        if (Object.keys(currentRequests).length > maxBatchSize) {
          if (batchTimerRef.current) {
            clearTimeout(batchTimerRef.current);
          }
          batchTimerRef.current = setTimeout(processBatch, batchInterval);
        }
      }, 100);

      // Return the current state unchanged - we don't remove until responses come back
      return currentRequests;
    });
  }, [maxBatchSize, batchInterval]);

  // Set up batch processing when requests change
  useEffect(() => {
    const requestCount = Object.keys(requests).length;

    // If we have requests and no timer is scheduled
    if (requestCount > 0 && !batchTimerRef.current && !isBatchingRef.current) {
      // Schedule batch processing
      batchTimerRef.current = setTimeout(() => {
        batchTimerRef.current = null;
        processBatch();
      }, batchInterval);
    }

    // Clean up timer on unmount
    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
    };
  }, [requests, processBatch, batchInterval]);

  // Function to add a request and return a promise
  const checkResources = useCallback(
    (
      requestData: Omit<CheckResourcesRequest, "requestId">
    ): Promise<CheckResourcesResponse> => {
      if (!isReady) {
        console.warn("[CerbosProvider] PDP not ready, rejecting request");
        return Promise.reject(new Error("Cerbos PDP not initialized"));
      }

      stats.current.totalRequests++;
      const requestId = uuid.v4() as string;
      const requestWithId: CheckResourcesRequest = {
        ...requestData,
        requestId: requestId,
      };
      console.log(`[CerbosProvider] Creating new request: ${requestId}`);

      return new Promise<CheckResourcesResponse>((resolve, reject) => {
        // Set up timeout
        const timeoutId = setTimeout(() => {
          console.warn(
            `[CerbosProvider] Request ${requestId} is timing out after ${requestTimeout}ms`
          );

          // Atomic update to prevent race conditions
          setRequests((currentRequests) => {
            if (currentRequests[requestId]) {
              // Reject the promise only if it's still pending
              currentRequests[requestId].reject(
                new Error(
                  `Request ${requestId} timed out after ${requestTimeout}ms`
                )
              );

              // We'll clean up in the state update
              cleanupRequest(requestId, "timeout");

              // Return new state without this request
              const { [requestId]: _, ...remaining } = currentRequests;
              return remaining;
            }
            return currentRequests; // No change needed if already processed
          });
        }, requestTimeout);

        // Store the timeout ID
        activeTimeouts.current[requestId] = timeoutId;

        // Add request to state with creation timestamp
        setRequests((prev) => {
          console.log(
            `[CerbosProvider] Adding request ${requestId} to queue, current queue size: ${
              Object.keys(prev).length
            }`
          );
          return {
            ...prev,
            [requestId]: {
              request: requestWithId,
              resolve,
              reject,
              createdAt: Date.now(),
            },
          };
        });
      });
    },
    [isReady, requestTimeout, cleanupRequest]
  );

  // Callback for the WebView to send back responses
  const handleResponse = useCallback(
    (responsePB: CheckResourcesResponsePB): void => {
      const requestId = responsePB.requestId;
      console.log(
        `[CerbosProvider] Received response for request: ${requestId}`
      );

      const pendingRequest = requests[requestId];

      if (pendingRequest) {
        const processingTime = Date.now() - pendingRequest.createdAt;
        console.log(
          `[CerbosProvider] Processing response for request ${requestId} (took ${processingTime}ms)`
        );

        try {
          const response = checkResourcesResponseFromProtobuf(responsePB);
          pendingRequest.resolve(response);
          cleanupRequest(requestId, "success");
        } catch (error) {
          console.error(
            `[CerbosProvider] Error converting protobuf response for ${requestId}:`,
            error
          );
          pendingRequest.reject(error);
          cleanupRequest(requestId, "failure");
        }
      } else {
        console.warn(
          `[CerbosProvider] Received response for unknown or already processed request ID: ${requestId}`
        );
      }
    },
    [requests, cleanupRequest]
  );

  // Callback for the WebView to report errors during processing
  const handleError = useCallback(
    (requestId: string, error: Error): void => {
      console.error(`[CerbosProvider] Error for request ${requestId}:`, error);

      const pendingRequest = requests[requestId];

      if (pendingRequest) {
        const processingTime = Date.now() - pendingRequest.createdAt;
        console.log(
          `[CerbosProvider] Processing error for request ${requestId} (took ${processingTime}ms)`
        );

        pendingRequest.reject(error);
        cleanupRequest(requestId, "failure");
      } else {
        console.warn(
          `[CerbosProvider] Received error for unknown or already processed request ID: ${requestId}`,
          error
        );
      }
    },
    [requests, cleanupRequest]
  );

  const value = {
    checkResources,
    pdpLoadedAt,
    isLoaded: isReady,
  };

  return (
    <CerbosContext.Provider value={value}>
      {children}
      <View style={{ height: 0 }}>
        <CerbosEmbeddedPDPWebView
          url={pdpUrl}
          refreshIntervalSeconds={refreshIntervalSeconds}
          handlePDPUpdated={() => {
            setPDPLoadedAt(new Date());
          }}
          // Pass the batched requests to WebView
          requests={batchedRequests}
          handleResponse={handleResponse}
          handleError={handleError}
          loaded={setIsReady}
          dom={{ style: { height: 0 }, matchContents: false }}
        />
      </View>
    </CerbosContext.Provider>
  );
};

// Custom hook to use the Cerbos context
export const useCerbos = (): CerbosContextType => {
  const context = useContext(CerbosContext);
  if (context === undefined) {
    throw new Error("useCerbos must be used within a CerbosProvider");
  }
  return context;
};
