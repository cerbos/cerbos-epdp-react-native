"use dom";

import { AutoUpdatingLoader, Embedded } from "@cerbos/embedded";
import { DOMProps } from "expo/dom";
import { useEffect, useState, useRef } from "react"; // Import useRef
import { PDPRequest } from "./CerbosContext";
import { CheckResourcesRequest } from "@cerbos/embedded/lib/protobuf/cerbos/request/v1/request";
import { CheckResourcesResponse } from "@cerbos/embedded/lib/protobuf/cerbos/response/v1/response";

interface CerbosEmbeddedPDPWebViewProps {
  url: string;
  refreshInterval: number;
  loaded: (isLoaded: boolean) => void;
  dom: DOMProps;
  requests: PDPRequest[];
  handleResponse: (response: CheckResourcesResponse) => void;
}

export default function CerbosEmbeddedPDPWebView({
  url,
  refreshInterval,
  loaded,
  requests,
  handleResponse,
}: CerbosEmbeddedPDPWebViewProps) {
  const [cerbos, setCerbos] = useState<Embedded | null>(null);
  // Use a ref to keep track of processed request IDs without causing re-renders
  const processedRequestIds = useRef(new Set<string>());

  useEffect(() => {
    const loader = new AutoUpdatingLoader(url, {
      onLoad: () => {
        loaded(true);
      },
      interval: refreshInterval,
    });
    setCerbos(new Embedded(loader));

    // Cleanup function to stop the loader when the component unmounts
    return () => {
      loader.stop();
    };
  }, [url, refreshInterval, loaded]); // Added dependencies

  useEffect(() => {
    // Ensure cerbos is initialized
    if (!cerbos) {
      return;
    }

    // Define the async function to process a single request
    const processRequest = async (request: PDPRequest) => {
      // Check if already processed
      if (processedRequestIds.current.has(request.request.requestId!)) {
        return;
      }

      console.log("Processing Cerbos request:", request.request.requestId);
      // Mark as processing immediately to prevent duplicates in rapid succession
      processedRequestIds.current.add(request.request.requestId!);
      try {
        // Perform the checkResources call
        const response = await cerbos.checkResources(request.request);
        console.log("Cerbos response:", response);
        // Call the handleResponse callback with the result
        handleResponse({
          ...response,
          requestId: request.request.requestId!,
        });
      } catch (error) {
        console.error(
          `Error processing Cerbos request ${request.request.requestId}:`,
          error
        );
        // Optionally remove from processed set if you want to allow retries on error
        // processedRequestIds.current.delete(request.request.requestId);
        // Optionally handle the error, e.g., call handleResponse with an error structure
      }
    };

    // Iterate over all requests and process unprocessed ones
    requests.forEach((request) => {
      if (!processedRequestIds.current.has(request.request.requestId!)) {
        processRequest(request);
      }
    });

    // Depend on cerbos instance, the requests array, and handleResponse
  }, [cerbos, requests, handleResponse]);

  return <div>Loaded: {cerbos ? "true" : "false"}</div>;
}
