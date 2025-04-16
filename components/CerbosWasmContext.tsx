import * as WebAssembly from "react-native-webassembly";
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { CheckResourcesRequest } from "@cerbos/embedded/lib/protobuf/cerbos/request/v1/request";
import { CheckResourcesResponse } from "@cerbos/embedded/lib/protobuf/cerbos/response/v1/response";
import axios from "axios";
import { NotOK } from "@cerbos/core";

import { ThemedText } from "./ThemedText";
import { Allocator, Slice, utf8Decoder, utf8Encoder } from "@/slice";

const memory = new WebAssembly.Memory({ initial: 2114120 });

interface WASMExports extends Allocator {
  check: (offset: number, length: number) => bigint;
  metadata: () => bigint;
  set_default_policy_version: (offset: number, length: number) => void;
  set_globals: (offset: number, length: number) => void;
  set_lenient_scope_search: (value: number) => void;
}

// Define the shape of the context
interface CerbosWasmContextType {
  loaded: boolean;
  checkResources: (
    request: CheckResourcesRequest
  ) => Promise<CheckResourcesResponse>;
}

// Create a context with a default value
const CerbosWasmContext = createContext<CerbosWasmContextType>({
  loaded: false,
  checkResources: async () => {
    throw new Error("Cerbos PDP not initialized");
  },
});

// Provider props
interface CerbosWasmProviderProps {
  children: ReactNode;
  pdpUrl: string;
  updateInterval?: number;
}

function secondsSinceUnixEpoch(date: Date | number): bigint {
  const millisecondsSinceUnixEpoch =
    date instanceof Date ? date.getTime() : date;

  return BigInt(Math.floor(millisecondsSinceUnixEpoch / 1000));
}

// Create the provider component
export const CerbosWasmProvider: React.FC<CerbosWasmProviderProps> = ({
  children,
  pdpUrl,
  updateInterval = 60, // default update interval in seconds
}) => {
  const [instance, setInstance] = useState<
    WebAssembly.WebassemblyInstance<WASMExports> | undefined
  >();

  useEffect(() => {
    const init = async () => {
      const { data: bufferSource } = await axios({
        url: pdpUrl,
        method: "get",
        responseType: "arraybuffer",
      });

      const module = await WebAssembly.instantiate<WASMExports>(bufferSource, {
        // Declare custom memory implementation.
        // env: {
        //   memory,
        // },
        // Define the scope of the import functions.
        runtime: {
          now: () => secondsSinceUnixEpoch(Date.now()),
        },
      });

      console.log("WASM module loaded");

      setInstance(module.instance);
    };
    init();
  }, []);

  function checkResources(
    request: CheckResourcesRequest
  ): Promise<CheckResourcesResponse> {
    let response: CheckResourcesResponse | undefined = undefined;
    let auxData: undefined = undefined;
    let error: unknown = undefined;

    if (!instance) {
      throw new Error("Cerbos PDP not initialized");
    }

    try {
      const requestJSON = CheckResourcesRequest.toJSON(request) as {
        auxData?: { jwt?: unknown };
      };
      const requestSlice = Slice.ofJSON(instance.exports, requestJSON);

      let responseSlice: Slice;
      try {
        responseSlice = Slice.from(
          instance.exports,
          instance.exports.check(requestSlice.offset, requestSlice.length)
        );
      } finally {
        requestSlice.deallocate();
      }

      let responseText: string;
      try {
        responseText = responseSlice.text();
      } finally {
        responseSlice.deallocate();
      }

      try {
        response = CheckResourcesResponse.fromJSON(JSON.parse(responseText));
      } catch {
        throw NotOK.fromJSON(responseText);
      }

      return Promise.resolve(response);
    } catch (caught) {
      error = caught;
      throw caught;
    } finally {
      if (response && !request.includeMeta) {
        for (const result of response.results) {
          result.meta = undefined;
        }
      }
    }
  }

  const value = {
    checkResources,
    loaded: !!instance,
  };

  return (
    <CerbosWasmContext.Provider value={value}>
      {!instance ? <ThemedText>Loading WASM</ThemedText> : children}
    </CerbosWasmContext.Provider>
  );
};

// Custom hook to use the Cerbos context
export const useCerbosWasm = (): CerbosWasmContextType => {
  const context = useContext(CerbosWasmContext);
  if (context === undefined) {
    throw new Error("useCerbosWasm must be used within a CerbosWasmProvider");
  }
  return context;
};
