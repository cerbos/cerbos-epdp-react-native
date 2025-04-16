"use dom";

import { AutoUpdatingLoader, Embedded } from "@cerbos/embedded";
import { DOMProps } from "expo/dom";
import { useEffect, useState, useRef } from "react";
import { SerializablePDPRequests } from "./CerbosContext";
import { CheckResourcesResponse as CheckResourcesResponsePB } from "@cerbos/embedded/lib/protobuf/cerbos/response/v1/response";
import { Effect } from "@cerbos/embedded/lib/protobuf/cerbos/effect/v1/effect";

interface CerbosEmbeddedPDPWebViewProps {
  url: string;
  refreshInterval: number;
  loaded: (isLoaded: boolean) => void;
  dom: DOMProps;
  requests: SerializablePDPRequests;
  handleResponse: (response: CheckResourcesResponsePB) => void;
  handleError: (requestId: string, error: Error) => void; // Add error handler prop
  handlePDPUpdated: () => void; // Add PDP updated handler prop
}

export default function CerbosEmbeddedPDPWebView({
  url,
  refreshInterval,
  loaded,
  requests,
  handleResponse,
  handleError,
  handlePDPUpdated,
}: CerbosEmbeddedPDPWebViewProps) {
  const [cerbos, setCerbos] = useState<Embedded | null>(null);
  const processedRequestIds = useRef(new Set<string>());

  useEffect(() => {
    let loader: AutoUpdatingLoader | null = null;
    try {
      loader = new AutoUpdatingLoader(url, {
        onLoad: () => {
          console.log("[CerbosWebview] Policy bundle loaded.");
          handlePDPUpdated();
          loaded(true);
        },
        onError: (err) => {
          console.error("[CerbosWebview] Error loading policy bundle:", err);
          loaded(false); // Indicate loading failed
        },
        interval: refreshInterval * 1000, // Convert seconds to milliseconds
      });
      setCerbos(new Embedded(loader));
    } catch (error) {
      console.error(
        "[CerbosWebview] Failed to initialize Cerbos Embedded PDP:",
        error
      );
      loaded(false);
    }

    // Cleanup function to stop the loader when the component unmounts
    return () => {
      console.log("[CerbosWebview] Stopping policy bundle loader.");
      loader?.stop();
      setCerbos(null); // Clear the cerbos instance
      loaded(false); // Set loaded to false on unmount/cleanup
    };
  }, []); // Dependencies

  useEffect(() => {
    if (!cerbos) {
      return;
    }

    // Process requests that haven't been processed yet
    Object.entries(requests).forEach(async ([requestId, requestData]) => {
      if (processedRequestIds.current.has(requestId)) {
        console.log(
          `[CerbosWebview] Skipping already processing request: ${requestId}`
        );
        return; // Skip already processed or currently processing requests
      }

      // Mark as processing immediately
      processedRequestIds.current.add(requestId);
      console.log("[CerbosWebview] Processing Cerbos request:", requestId);

      try {
        // Perform the checkResources call with the Protobuf request
        const response = await cerbos.checkResources(requestData);
        console.log(
          `[CerbosWebview] Request ${requestId} response received successfully`
        );

        console.log(
          "[CerbosWebview] Auth check result:",
          JSON.stringify(response)
        );

        // Pass the Protobuf response back to the context
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
        );
      } finally {
        // Always remove from processing set regardless of success or failure
        processedRequestIds.current.delete(requestId);
      }
    });
    // Depend on cerbos instance and the requests object
  }, [cerbos, requests, handleResponse, handleError]);

  // Optional: Clean up processedRequestIds when requests are removed from props
  useEffect(() => {
    const currentRequestIds = new Set(Object.keys(requests));
    const toRemove: string[] = [];
    processedRequestIds.current.forEach((id) => {
      if (!currentRequestIds.has(id)) {
        toRemove.push(id);
      }
    });

    // Remove outside the loop to avoid modifying during iteration
    toRemove.forEach((id) => {
      console.log(
        `[CerbosWebview] Cleaning up stale request ID from tracking: ${id}`
      );
      processedRequestIds.current.delete(id);
    });
  }, [requests]);

  // Render null or a minimal element as this is primarily a background task component
  return null;
}
