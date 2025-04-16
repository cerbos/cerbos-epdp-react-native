"use dom";

import { AutoUpdatingLoader, Embedded } from "@cerbos/embedded";
import { DOMProps } from "expo/dom";
import { useEffect, useState, useRef } from "react";
import { SerializablePDPRequests } from "./CerbosContext";
import { CheckResourcesResponse as CheckResourcesResponsePB } from "@cerbos/embedded/lib/protobuf/cerbos/response/v1/response";
import { Effect } from "@cerbos/embedded/lib/protobuf/cerbos/effect/v1/effect";

// Define the component's props interface
interface CerbosEmbeddedPDPWebViewProps {
  url: string;
  refreshIntervalSeconds: number;
  loaded: (isLoaded: boolean) => void;
  dom: DOMProps;
  requests: SerializablePDPRequests;
  handleResponse: (response: CheckResourcesResponsePB) => void;
  handleError: (requestId: string, error: Error) => void; // Error handler callback
  handlePDPUpdated: () => void; // Callback for when the PDP is updated
}

export default function CerbosEmbeddedPDPWebView({
  url,
  refreshIntervalSeconds,
  loaded,
  requests,
  handleResponse,
  handleError,
  handlePDPUpdated,
}: CerbosEmbeddedPDPWebViewProps) {
  const [cerbos, setCerbos] = useState<Embedded | null>(null); // Cerbos instance state
  const processedRequestIds = useRef(new Set<string>()); // Track processed request IDs

  // Initialize and manage the AutoUpdatingLoader
  useEffect(() => {
    let loader: AutoUpdatingLoader | null = null;

    try {
      loader = new AutoUpdatingLoader(url, {
        onLoad: (metadata) => {
          console.log(
            `[CerbosWebview] Policy bundle loaded. ${metadata.commit} - ${metadata.builtAt}`
          );
          handlePDPUpdated(); // Notify PDP update
          loaded(true); // Indicate successful loading
        },
        onError: (err) => {
          console.error("[CerbosWebview] Error loading policy bundle:", err);
          loaded(false); // Indicate loading failure
        },
        activateOnLoad: true,
        interval: refreshIntervalSeconds * 1000, // Convert seconds to milliseconds
      });
      setCerbos(new Embedded(loader)); // Set the Cerbos instance
    } catch (error) {
      console.error(
        "[CerbosWebview] Failed to initialize Cerbos Embedded PDP:",
        error
      );
      loaded(false); // Indicate initialization failure
    }

    // Cleanup function to stop the loader on unmount
    return () => {
      console.log("[CerbosWebview] Stopping policy bundle loader.");
      loader?.stop();
      setCerbos(null); // Clear the Cerbos instance
      loaded(false); // Reset loaded state
    };
  }, [url, refreshIntervalSeconds]); // Re-run if URL or interval changes

  // Process incoming requests
  useEffect(() => {
    if (!cerbos) return;

    Object.entries(requests).forEach(async ([requestId, requestData]) => {
      if (processedRequestIds.current.has(requestId)) {
        console.log(
          `[CerbosWebview] Skipping already processed request: ${requestId}`
        );
        return; // Skip already processed requests
      }

      processedRequestIds.current.add(requestId); // Mark request as processing
      console.log("[CerbosWebview] Processing Cerbos request:", requestId);

      try {
        const response = await cerbos.checkResources(requestData); // Perform the check
        console.log(
          `[CerbosWebview] Request ${requestId} response received successfully`
        );

        // Transform and pass the response to the handler
        handleResponse({
          requestId: response.requestId,
          cerbosCallId: response.cerbosCallId,
          results: response.results.map((result) => ({
            resource: result.resource,
            meta: result.metadata,
            actions: Object.fromEntries(
              Object.entries(result.actions).map(([k, v]) => [k, Effect[v]])
            ),
            validationErrors: [],
            outputs: [],
          })),
        });
      } catch (error) {
        console.error(
          `[CerbosWebview] Error processing Cerbos request ${requestId}:`,
          error
        );
        handleError(
          requestId,
          error instanceof Error ? error : new Error(String(error))
        ); // Pass error to handler
      } finally {
        processedRequestIds.current.delete(requestId); // Remove from processing set
      }
    });
  }, [cerbos, requests, handleResponse, handleError]); // Re-run if dependencies change

  // Cleanup stale request IDs when requests are removed
  useEffect(() => {
    const currentRequestIds = new Set(Object.keys(requests));
    const toRemove: string[] = [];

    processedRequestIds.current.forEach((id) => {
      if (!currentRequestIds.has(id)) {
        toRemove.push(id);
      }
    });

    toRemove.forEach((id) => {
      console.log(
        `[CerbosWebview] Cleaning up stale request ID from tracking: ${id}`
      );
      processedRequestIds.current.delete(id);
    });
  }, [requests]);

  // Render nothing as this is a background task component
  return null;
}
