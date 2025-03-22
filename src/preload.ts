// preload.ts - Expose IPC communication to the renderer process
import { contextBridge, ipcRenderer, webContents } from 'electron';
import ethers from 'ethers';

// Define the shape of our exposed API
interface ElectronAPI {
  // App generation
  generateApp: (prompt: string) => Promise<any>;
  runApp: (appPath: string) => Promise<any>;

  // Window controls
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;

  // Network API for embedded apps
  fetch: (url: string, options?: any) => Promise<any>;
  request: (config: any) => Promise<any>;
}

// Expose protected methods that allow the renderer process to use the ipcRenderer
// without exposing the entire object
contextBridge.exposeInMainWorld(
  'electronAPI',
  {
    // App generation
    generateApp: (prompt: string) => ipcRenderer.invoke('generate-app', prompt),
    runApp: (appPath: string) => ipcRenderer.invoke('run-app', appPath),

    // Window controls
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),

    // Network API for embedded apps
    fetch: (url: string, options?: any) => ipcRenderer.invoke('app-fetch', url, options),
    request: (config: any) => ipcRenderer.invoke('app-request', config),
  } as ElectronAPI
);

// Define transaction interface
interface TransactionRequest {
  to?: string;
  from?: string;
  nonce?: number;
  gasLimit?: number;
  gasPrice?: number;
  data?: string;
  value?: number | string;
  chainId?: number;
}

// Expose wallet methods to the renderer process
contextBridge.exposeInMainWorld(
  'walletAPI', {
  getAddress: (): Promise<string> => ipcRenderer.invoke('get-wallet-address'),
  signMessage: (message: string): Promise<string> => ipcRenderer.invoke('sign-message', message),
  signTransaction: (txData: TransactionRequest): Promise<string> => ipcRenderer.invoke('sign-transaction', txData),
  sendTransaction: (txData: TransactionRequest): Promise<string> => ipcRenderer.invoke('send-transaction', txData),
  getChainId: (): Promise<number> => ipcRenderer.invoke('get-chain-id')
});

// Expose ethers utils to renderer
contextBridge.exposeInMainWorld(
  'ethersUtils', {
  parseEther: (value: string) => ethers.parseEther(value).toString(),
  parseUnits: (value: string, unit: string) => ethers.parseUnits(value, unit).toString(),
  formatEther: (value: any) => ethers.formatEther(value)
});

// Expose webview handler
contextBridge.exposeInMainWorld(
  'webviewHandler', {
  injectProvider: (webviewId: string): void => {
    // This function will be called when the webview is ready
    document.addEventListener('DOMContentLoaded', () => {
      const webview = document.getElementById(webviewId) as Electron.WebviewTag;
      if (!webview) {
        console.error(`Webview with id ${webviewId} not found`);
        return;
      }

      webview.addEventListener('dom-ready', () => {
        console.log('Webview DOM ready, injecting provider...');
        // Inject the ethereum provider into the webview
        injectEthereumProvider(webview);
      });
    });
  }
});

// Function to inject ethereum provider into webview
function injectEthereumProvider(webview: Electron.WebviewTag): void {
  if (!webview) {
    console.error('Webview not found');
    return;
  }

  // Check if executeJavaScript is available
  if (typeof webview.executeJavaScript !== 'function') {
    console.error('executeJavaScript not available');
    return;
  }

  // Injection script that will be injected into the webview
  const injectionScript = `
    (function() {
      if (window.ethereum) {
        console.log('Provider already exists, skipping injection');
        return;
      }

      // Create ethereum provider
      window.ethereum = {
        isMetaMask: true,
        isElectronWallet: true,
        
        // Required methods
        request: async (payload) => {
          // Send to parent window via postMessage
          return new Promise((resolve, reject) => {
            const requestId = Date.now().toString() + Math.random().toString();
            
            // Setup listener for response
            window.addEventListener('message', function responseHandler(event) {
              if (event.data && event.data.id === requestId) {
                window.removeEventListener('message', responseHandler);
                if (event.data.error) {
                  reject(new Error(event.data.error));
                } else {
                  resolve(event.data.result);
                }
              }
            });
            
            // Send request to parent
            window.parent.postMessage({
              type: 'ethereum-request',
              id: requestId,
              payload
            }, '*');
          });
        },
        
        // Legacy methods (for backwards compatibility)
        enable: async () => {
          const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
          });
          return accounts;
        },
        
        // Event handling
        _events: {},
        on: function(eventName, listener) {
          if (!this._events[eventName]) this._events[eventName] = [];
          this._events[eventName].push(listener);
          return this;
        },
        removeListener: function(eventName, listener) {
          if (!this._events[eventName]) return this;
          this._events[eventName] = this._events[eventName].filter(l => l !== listener);
          return this;
        },
        _emit: function(eventName, ...args) {
          if (!this._events[eventName]) return;
          this._events[eventName].forEach(listener => listener(...args));
        }
      };
      
      // Let dApps know provider is available
      console.log('Electron Wallet: Ethereum provider injected');
      window.dispatchEvent(new Event('ethereum#initialized'));
    })();
  `;

  // Inject the script using executeJavaScript
  try {
    webview.addEventListener('did-finish-load', function () {
      webview.executeJavaScript(injectionScript)
        .then(() => console.log('Ethereum provider injection successful'))
        .catch(err => console.error('Error executing injection script:', err));
    });
  } catch (error) {
    console.error('Failed to inject Ethereum provider:', error);
  }

  // Set up message handlers for communication between webview and main process
  webview.addEventListener('ipc-message', async (event) => {
    if (event.channel === 'ethereum-request') {
      try {
        const { id, payload } = event.args[0];

        // Process the request with the wallet API
        let result;
        switch (payload.method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            const address = await ipcRenderer.invoke('get-wallet-address');
            result = [address];
            break;

          case 'eth_chainId':
            const chainId = await ipcRenderer.invoke('get-chain-id');
            result = '0x' + chainId.toString(16);
            break;

          case 'eth_signMessage':
          case 'personal_sign':
            result = await ipcRenderer.invoke('sign-message', payload.params[1] || payload.params[0]);
            break;

          case 'eth_sendTransaction':
            result = await ipcRenderer.invoke('send-transaction', payload.params[0]);
            break;

          default:
            result = await ipcRenderer.invoke('wallet-request', {
              method: payload.method,
              params: payload.params
            });
        }

        // Send the response back to the webview
        webview.send('ethereum-response', { id, result });
      } catch (error) {
        webview.send('ethereum-response', {
          id: event.args[0].id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });
}