/// <reference types="vite/client" />
// The registry module the realtime() Vite plugin generates from your procedures folder.
declare module 'virtual:realtime/registry' {
  import type { Registry } from '@builtbyfriends/realtime';
  export const registry: Registry;
  export const app: { name: string; version: string; basePath: string; mcpRoute: string };
}

// The /__realtime page's HTML, read from devtools.html by the realtime() plugin (dev only).
declare module 'virtual:realtime/devtools-page' {
  const html: string;
  export default html;
}
