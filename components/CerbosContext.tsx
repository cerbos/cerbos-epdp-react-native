import React, { createContext, useContext, useState, ReactNode } from "react";
import CerbosEmbeddedPDPWebView from "./CerbosEmbeddedPDPWebView";
import { CheckResourcesRequest } from "@cerbos/embedded/lib/protobuf/cerbos/request/v1/request";
import { CheckResourcesResponse } from "@cerbos/embedded/lib/protobuf/cerbos/response/v1/response";

// Define the shape of the context
interface CerbosContextType {
  isLoaded: boolean;
  checkResources: (
    request: CheckResourcesRequest
  ) => Promise<CheckResourcesResponse>;
}

// Create a context with a default value
const CerbosContext = createContext<CerbosContextType>({
  isLoaded: false,
  checkResources: async () => {
    throw new Error("Cerbos PDP not initialized");
  },
});

// Provider props
interface CerbosProviderProps {
  children: ReactNode;
  pdpUrl: string;
  updateInterval?: number;
}

export interface PDPRequest {
  request: CheckResourcesRequest;
  response?: CheckResourcesResponse;
}

// Create the provider component
export const CerbosProvider: React.FC<CerbosProviderProps> = ({
  children,
  pdpUrl,
  updateInterval = 60, // default update interval in seconds
}) => {
  const [isReady, setIsReady] = useState(false);
  const [requests, setRequests] = useState<PDPRequest[]>([]);

  // Wrapper for the checkResource function that handles errors
  const checkResources = async (
    request: CheckResourcesRequest
  ): Promise<CheckResourcesResponse> => {
    if (!isReady) {
      throw new Error("Cerbos PDP not initialized");
    }

    try {
      // Add the request to the list of requests
      const requestId = request.requestId || String(Date.now());
      const newRequest: PDPRequest = {
        request: {
          ...request,
          requestId,
        },
      };
      setRequests((prev) => [...prev, newRequest]);

      // with a dummy response
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          console.log("Checking for response...");
          const response = requests.find(
            (req) => req.request.requestId == requestId
          )?.response;
          if (response) {
            console.log("Response received:", response);
            clearInterval(interval);
            resolve(response);
          }
        }, 100); // Check every 100ms
      });
    } catch (err) {
      console.error("Error checking resource:", err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  };

  const value = {
    checkResources,
    isLoaded: isReady,
  };

  return (
    <CerbosContext.Provider value={value}>
      {children}
      <CerbosEmbeddedPDPWebView
        url={pdpUrl}
        refreshInterval={updateInterval}
        requests={requests}
        handleResponse={function (response: CheckResourcesResponse): void {
          setRequests((prev) => {
            const newRequests = [...prev];
            const index = newRequests.findIndex(
              (req) => req.request.requestId === response.requestId
            );
            if (index !== -1) {
              newRequests[index].response = response;
            }
            return newRequests;
          });
        }}
        loaded={function (isLoaded: boolean): void {
          setIsReady(isLoaded);
        }}
        dom={{}}
      />
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
