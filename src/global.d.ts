// Add to your declarations in renderer.ts or a separate .d.ts file
interface Window {
  electronAPI: ElectronAPI;
  originalFetch: typeof fetch;
  request: (config: RequestConfig) => Promise<any>;
  appNetworkCapabilities: {
    fetch: boolean;
    request: boolean;
  };

  walletAPI: {
    getAddress: () => Promise<string>;
    signMessage: (message: string) => Promise<string>;
    signTransaction: (txData: any) => Promise<string>;
    sendTransaction: (txData: any) => Promise<string>;
    getChainId: () => Promise<number>;
  };
  webviewHandler: {
    injectProvider: (webviewId: string) => void;
  };
  // Add wallet interface
  wallet: {
    getWalletFromMnemonic(): Promise<WalletResult>;
    getAccount(): Promise<WalletResult>;
    signTransaction(transaction: any): Promise<WalletResult>;
    sendTransaction(transaction: any): Promise<WalletResult>;
    getWalletFromMnemonic(): Promise<{
      address: string;
      success: boolean;
      error?: string;
    }>;

    getAccount(): Promise<{
      address: string;
      balance: string;
      success: boolean;
      error?: string;
    }>;

    signTransaction(transaction: any): Promise<{
      signedTx?: string;
      success: boolean;
      error?: string;
    }>;

    sendTransaction(transaction: any): Promise<{
      txHash?: string;
      success: boolean;
      error?: string;
    }>;
  };
  // Add ethersUtils interface
  ethersUtils: {
    parseEther(value: string): any;
    parseUnits(value: string, unit: string): any;
    formatEther(value: any): string;
  };
}

// Add WalletResult interface
interface WalletResult {
  address?: string;
  balance?: string;
  signedTx?: string;
  txHash?: string;
  success: boolean;
  error?: string;
}
