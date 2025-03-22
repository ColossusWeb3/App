// Modified webview-preload.ts - No executeJavaScript dependency
import { contextBridge, ipcRenderer } from 'electron';

// Define ethereum provider interface
interface EthereumProvider {
  isMetaMask: boolean;
  isElectronWallet: boolean;
  _metamask: {
    isUnlocked: () => Promise<boolean>;
    isEnabled: () => Promise<boolean>;
    isMetaMask: boolean;
  };
  request: (payload: { method: string; params?: any[] }) => Promise<any>;
  enable: () => Promise<string[]>;
  on: (eventName: string, listener: (...args: any[]) => void) => EthereumProvider;
  removeListener: (eventName: string, listener: (...args: any[]) => void) => EthereumProvider;
  _events: Record<string, Array<(...args: any[]) => void>>;
  _emit: (eventName: string, ...args: any[]) => void;
  selectedAddress: string | null;
  chainId: string | null;
  networkVersion: string | null;
}

// Create initial provider values
let selectedAddress: string | null = null;
let chainIdHex: string | null = null;

// Initialize provider data
async function initProviderData() {
  try {
    // Get wallet address
    const address = await ipcRenderer.invoke('get-wallet-address');
    selectedAddress = address;
    
    // Get chain ID
    const chainId = await ipcRenderer.invoke('get-chain-id');
    chainIdHex = '0x' + chainId.toString(16);
    
    console.log('Provider initialized with address:', selectedAddress, 'chain:', chainIdHex);
  } catch (error) {
    console.error('Failed to initialize provider data:', error);
  }
}

// Create ethereum provider
const ethereum: EthereumProvider = {
  isMetaMask: true,
  isElectronWallet: true,
  
  // Enhanced _metamask property
  _metamask: {
    isUnlocked: async () => true,
    isEnabled: async () => true,
    isMetaMask: true
  },
  
  // Current values (will be populated after init)
  selectedAddress: null,
  chainId: null,
  networkVersion: null,
  
  // Main request method
  request: (payload: { method: string; params?: any[] }): Promise<any> => {
    console.log('Provider request:', payload.method, payload.params);
    
    // Special handling for eth_requestAccounts
    if (payload.method === 'eth_requestAccounts') {
      if (ethereum.selectedAddress) {
        console.log('Using cached address:', ethereum.selectedAddress);
        return Promise.resolve([ethereum.selectedAddress]);
      }
    }
    
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString() + Math.random().toString();
      
      // Handler for the response
      const responseHandler = (event: Electron.IpcRendererEvent, response: any) => {
        if (response.id === requestId) {
          ipcRenderer.removeListener('ethereum-response', responseHandler);
          
          if (response.error) {
            reject(new Error(response.error));
          } else {
            // For account-related requests
            if (payload.method === 'eth_requestAccounts' || payload.method === 'eth_accounts') {
              if (Array.isArray(response.result) && response.result.length > 0) {
                ethereum.selectedAddress = response.result[0];
                ethereum._emit('accountsChanged', response.result);
              }
            }
            
            // For chain-related requests
            if (payload.method === 'eth_chainId') {
              ethereum.chainId = response.result;
              ethereum.networkVersion = parseInt(response.result, 16).toString();
              ethereum._emit('chainChanged', response.result);
            }
            
            resolve(response.result);
          }
        }
      };
      
      // Listen for the response
      ipcRenderer.on('ethereum-response', responseHandler);
      
      // Send the request
      ipcRenderer.send('ethereum-request', {
        id: requestId,
        payload
      });
    });
  },
  
  // Legacy methods
  enable: function(): Promise<string[]> {
    return this.request({ method: 'eth_requestAccounts' });
  },
  
  // Event handling
  _events: {},
  
  on: function(eventName: string, listener: (...args: any[]) => void): EthereumProvider {
    if (!this._events[eventName]) {
      this._events[eventName] = [];
    }
    this._events[eventName].push(listener);
    return this;
  },
  
  removeListener: function(eventName: string, listener: (...args: any[]) => void): EthereumProvider {
    if (!this._events[eventName]) return this;
    this._events[eventName] = this._events[eventName].filter((l: any) => l !== listener);
    return this;
  },
  
  _emit: function(eventName: string, ...args: any[]): void {
    console.log(`Emitting event: ${eventName}`, args);
    if (!this._events[eventName]) return;
    this._events[eventName].forEach((listener: any) => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in ${eventName} listener:`, error);
      }
    });
  }
};

// Initialize and expose the provider
(async function() {
  // Initialize provider data
  await initProviderData();
  
  // Update the provider with the fetched data
  ethereum.selectedAddress = selectedAddress;
  ethereum.chainId = chainIdHex;
  ethereum.networkVersion = chainIdHex ? parseInt(chainIdHex, 16).toString() : '1';
  
  // Expose the ethereum provider to the webview
  contextBridge.exposeInMainWorld('ethereum', ethereum);
  
  // Let the page know provider is available
  setTimeout(() => {
    if (ethereum.chainId) {
      ethereum._emit('connect', { chainId: ethereum.chainId });
      ethereum._emit('chainChanged', ethereum.chainId);
    }
    
    if (ethereum.selectedAddress) {
      ethereum._emit('accountsChanged', [ethereum.selectedAddress]);
    }
    
    window.dispatchEvent(new Event('ethereum#initialized'));
    console.log('Provider fully initialized and exposed');
  }, 100);
})();

// Listen for messages from main process
ipcRenderer.on('ethereum-response', (_, response) => {
  // Handle the response internally
  const { id, result, error } = response;
  
  // Use postMessage to communicate with the page
  window.postMessage({
    type: 'ethereum-response',
    id,
    result,
    error
  }, '*');
});

// Listen for ethereum events from main process
ipcRenderer.on('ethereum-event', (_, eventData) => {
  const { type, ...data } = eventData;
  ethereum._emit(type, data);
});

// Add document scripts via content script pattern
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded in preload script');
  
  // Create and inject anti-QR-code script
  try {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        // Override MetaMask detection to prevent QR code
        window.ethereum = window.ethereum || {};
        window.ethereum.isMetaMask = true;
        
        // Create observer to remove any QR code dialogs
        function setupObserver() {
          console.log('Setting up MetaMask QR code dialog observer');
          const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
              if (mutation.type === 'childList') {
                // Look for MetaMask dialogs or QR codes
                const dialogs = document.querySelectorAll('[role="dialog"]');
                dialogs.forEach(dialog => {
                  if (dialog.innerHTML && (
                    dialog.innerHTML.includes('MetaMask') || 
                    dialog.innerHTML.includes('QR') || 
                    dialog.innerHTML.includes('Scan with')
                  )) {
                    console.log('Found MetaMask dialog or QR code, removing');
                    dialog.style.display = 'none';
                    
                    // Try to auto-connect
                    if (window.ethereum && window.ethereum.request) {
                      window.ethereum.request({ method: 'eth_requestAccounts' })
                        .then(accounts => console.log('Auto-connected after dialog removal:', accounts))
                        .catch(err => console.error('Auto-connection failed:', err));
                    }
                  }
                });
                
                // Also look for wallet buttons and click them
                if (window.location.href.includes('aave.com')) {
                  const buttons = document.querySelectorAll('button');
                  buttons.forEach(button => {
                    if (button.textContent && (
                      button.textContent.includes('Connect') || 
                      button.textContent.includes('Wallet') || 
                      button.textContent.toLowerCase().includes('connect')
                    )) {
                      console.log('Found wallet connect button, clicking');
                      setTimeout(() => button.click(), 500);
                    }
                  });
                }
              }
            }
          });
          
          // Start observing after page is fully loaded
          setTimeout(() => {
            observer.observe(document.body, { childList: true, subtree: true });
          }, 1000);
        }
        
        // Set up observer when DOM is loaded
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', setupObserver);
        } else {
          setupObserver();
        }
        
        // Auto-connect after a delay
        setTimeout(() => {
          if (window.ethereum && window.ethereum.request) {
            console.log('Auto-connecting to wallet...');
            window.ethereum.request({ method: 'eth_requestAccounts' })
              .then(accounts => console.log('Auto-connected with accounts:', accounts))
              .catch(err => console.error('Auto-connection failed:', err));
          }
        }, 2000);
      })();
    `;
    document.head.appendChild(script);
    console.log('Injected anti-QR-code script');
    
    // Add site-specific scripts if needed
    if (window.location.href.includes('aave.com')) {
      const aaveScript = document.createElement('script');
      aaveScript.textContent = `
        // Aave-specific handling
        console.log('Adding Aave-specific handling');
        
        // Check for wallet connect buttons periodically
        function checkForConnectButton() {
          const buttons = document.querySelectorAll('button');
          buttons.forEach(button => {
            if (button.textContent && (
              button.textContent.includes('Connect') || 
              button.textContent.includes('Wallet') || 
              button.textContent.toLowerCase().includes('connect')
            )) {
              console.log('Found Aave connect button, clicking');
              button.click();
            }
          });
        }
        
        // Check multiple times
        setTimeout(checkForConnectButton, 1000);
        setTimeout(checkForConnectButton, 3000);
        setTimeout(checkForConnectButton, 5000);
      `;
      document.head.appendChild(aaveScript);
      console.log('Injected Aave-specific script');
    }
  } catch (error) {
    console.error('Failed to inject scripts:', error);
  }
});

// Handle direct page script messages
window.addEventListener('message', (event) => {
  // Ensure the message is a valid ethereum request
  if (event.data && event.data.type === 'ethereum-request') {
    const { id, payload } = event.data;
    
    // Forward the request to the main process
    ipcRenderer.send('ethereum-request', {
      id,
      payload
    });
  }
});

// Log initialization complete
console.log('Ethereum provider preload script initialized');