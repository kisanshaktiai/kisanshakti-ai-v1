/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_BUILD_TIMESTAMP: string;
  readonly VITE_BUILD_HASH: string;

}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
