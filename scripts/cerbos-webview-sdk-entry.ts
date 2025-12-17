import { Embedded } from '@cerbos/embedded-client';

(globalThis as unknown as { __cerbosEmbedded?: unknown }).__cerbosEmbedded = { Embedded };

