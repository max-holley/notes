/// <reference types="vite/client" />

declare module 'virtual:brand-assets' {
  import type { BrandAssets } from './brand/build.ts';
  const assets: BrandAssets;
  export default assets;
}
