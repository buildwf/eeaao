/// <reference types="vite/client" />
declare module 'virtual:realtime/registry' {
  import type { Registry } from '@builtbyfriends/realtime';
  export const registry: Registry;
  export const app: { name: string; version: string; basePath: string; mcpRoute: string };
}

declare module 'virtual:realtime/devtools-page' {
  const html: string;
  export default html;
}
