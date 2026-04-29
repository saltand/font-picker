type ChromeDebuggerTarget = {
  tabId?: number;
  extensionId?: string;
  targetId?: string;
};

type ChromeDebuggerApi = {
  attach(target: ChromeDebuggerTarget, requiredVersion: string, callback?: () => void): void;
  detach(target: ChromeDebuggerTarget, callback?: () => void): void;
  sendCommand(
    target: ChromeDebuggerTarget,
    method: string,
    commandParams?: object,
    callback?: (result?: unknown) => void,
  ): void;
};

declare const chrome: {
  runtime: {
    readonly lastError: { message: string } | undefined;
  };
  readonly 'debugger': ChromeDebuggerApi;
};
