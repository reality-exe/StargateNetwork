declare namespace NodeJS {
  export interface ProcessEnv {
    readonly WS_PORT: string;
    readonly PB_ENDPOINT: string;
    readonly PB_EMAIL: string;
    readonly PB_PASSWORD: string;
  }
}
