/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_CLUSTER?: "mainnet-beta" | "devnet" | "testnet";
  readonly VITE_PROGRAM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*?worker" {
  const ctor: { new (): Worker };
  export default ctor;
}

declare module "*.json" {
  const v: any;
  export default v;
}
