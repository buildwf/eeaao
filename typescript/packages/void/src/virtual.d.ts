/// <reference types="vite/client" />
// The registry module the eeao() Vite plugin generates from your procedures folder.
declare module 'virtual:eeao/registry' {
  import type { Registry } from '@eeao/core';
  export const registry: Registry;
  export const app: { name: string; version: string; basePath: string; mcpRoute: string };
}

// The /__eeao page's HTML, read from devtools.html by the eeao() plugin (dev only).
declare module 'virtual:eeao/devtools-page' {
  const html: string;
  export default html;
}
