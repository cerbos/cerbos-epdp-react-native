"use dom";

import { BundleMetadata, Embedded } from "@cerbos/embedded";
import { DOMProps } from "expo/dom";
import { useEffect, useState, useRef } from "react";
import { SerializablePDPRequests } from "./CerbosContext";
import { CheckResourcesResponse as CheckResourcesResponsePB } from "@cerbos/embedded/lib/protobuf/cerbos/response/v1/response";
import { Effect } from "@cerbos/embedded/lib/protobuf/cerbos/effect/v1/effect";
import { DecisionLogEntry } from "@cerbos/core";

// Define the component's props interface
interface CerbosEmbeddedPDPWebViewProps {
  pdpb64: string;
  refreshIntervalSeconds: number;
  loaded: (isLoaded: boolean) => void;
  dom: DOMProps;
  requests: SerializablePDPRequests;
  handleResponse: (response: CheckResourcesResponsePB) => void;
  handleDecisionLog?: (decision: DecisionLogEntry) => void;
  handleError: (requestId: string, error: Error) => void; // Error handler callback
  handlePDPUpdated: (metadata: { updatedAt: string } & BundleMetadata) => void; // Callback for when the PDP is updated
}

function asciiToBinary(str: string) {
  if (typeof atob === "function") {
    // this works in the browser
    return atob(str);
  } else {
    // this works in node
    return Buffer.from(str, "base64").toString("binary");
  }
}

function decode(encoded: string) {
  var binaryString = asciiToBinary(encoded);
  var bytes = new Uint8Array(binaryString.length);
  for (var i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export default function CerbosEmbeddedPDPWebView({
  pdpb64,
  refreshIntervalSeconds,
  loaded,
  requests,
  handleResponse,
  handleError,
  handleDecisionLog,
  handlePDPUpdated,
}: CerbosEmbeddedPDPWebViewProps) {
  const [cerbos, setCerbos] = useState<Embedded | null>(null); // Cerbos instance state
  const processedRequestIds = useRef(new Set<string>()); // Track processed request IDs

  // Initialize and manage the AutoUpdatingLoader
  useEffect(() => {
    let mounted = true; // Track if the component is mounted
    try {
      console.log("[CerbosWebview] Starting policy bundle loader...");
      setCerbos(
        new Embedded(decode(pdpb64), {
          onLoad: (metadata) => {
            console.log(
              "[CerbosWebview] Cerbos Embedded PDP loaded successfully"
            );
            if (mounted) {
              handlePDPUpdated({
                updatedAt: new Date().toISOString(), // Pass the current
                ...metadata, // Pass metadata
              });
              loaded(true); // Indicate successful loading
            }
          },
          onDecision(entry) {
            handleDecisionLog?.(entry); // Pass decision log entry to handler
          },
        })
      ); // Set the Cerbos instance
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
      setCerbos(null); // Clear the Cerbos instance
      loaded(false); // Reset loaded state
    };
  }, [pdpb64, refreshIntervalSeconds]); // Re-run if URL or interval changes

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
