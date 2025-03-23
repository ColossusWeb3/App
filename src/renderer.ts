/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/latest/tutorial/process-model
 */

import './index.css';

// Type definitions for Electron API
interface ElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  generateApp: (prompt: string) => Promise<GenerateAppResult>;
  runApp: (appPath: string) => Promise<RunAppResult>;
  fetch: (url: string, options?: RequestInit) => Promise<FetchResponse>;
  request: (config: RequestConfig) => Promise<any>;
}

interface GenerateAppResult {
  success: boolean;
  appPath?: string;
  appData?: AppData;
  error?: string;
}

interface RunAppResult {
  success: boolean;
  appData?: AppData;
  error?: string;
}

interface AppData {
  html: string;
  styles: string;
  logic: string;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  data: any;
  url: string;
}

interface RequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  data?: any;
  params?: Record<string, string>;
  timeout?: number;
}

// DOM elements
const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
const generateButton = document.getElementById('generate-btn') as HTMLButtonElement;
const appContainer = document.getElementById('generated-app-container') as HTMLDivElement;
const suggestionChips = document.querySelectorAll('.suggestion-chip') as NodeListOf<HTMLElement>;
const statusElement = document.querySelector('.status') as HTMLDivElement;

// Set up window control handlers
document.querySelector('.minimize')?.addEventListener('click', () => {
  window.electronAPI.minimizeWindow();
});

document.querySelector('.maximize')?.addEventListener('click', () => {
  window.electronAPI.maximizeWindow();
});

document.querySelector('.close')?.addEventListener('click', () => {
  window.electronAPI.closeWindow();
});

// Event handlers
generateButton.addEventListener('click', generateApp);
promptInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    generateApp();
  }
});

// Set up suggestion chips
suggestionChips.forEach(chip => {
  chip.addEventListener('click', () => {
    promptInput.value = chip.textContent || '';
    generateApp();
  });
});

// Function to generate an app from the prompt
async function generateApp(): Promise<void> {
  const prompt = promptInput.value.trim();

  if (!prompt) {
    showNotification('Please enter a prompt');
    return;
  }

  try {
    updateStatus('Generating your app...');
    showLoadingIndicator();

    // Call main process to generate the app
    const result = await window.electronAPI.generateApp(prompt);

    if (result.success) {
      updateStatus('App generated successfully');

      // Only display the app in the container - don't run in separate window
      if (result.appData) {
        displayGeneratedApp(result.appData);
      } else if (result.appPath) {
        // For compatibility with older implementation, load app data if not included
        const appResult = await window.electronAPI.runApp(result.appPath);
        if (appResult.success && appResult.appData) {
          displayGeneratedApp(appResult.appData);
        }
      }
    } else {
      updateStatus('Failed to generate app');
      showNotification('Error: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error generating app:', error);
    updateStatus('Error occurred');
    showNotification('An unexpected error occurred');
  } finally {
    hideLoadingIndicator();
  }
}

// Function to display the generated app
// function displayGeneratedApp(appData: AppData): void {
//   // Clear the container
//   appContainer.innerHTML = '';

//   // Create the network proxy script
//   const networkProxyScript = `
//     // Override fetch API to use IPC bridge
//     window.originalFetch = window.fetch;
//     window.fetch = async function(url, options = {}) {
//       try {
//         console.log('Fetch request initiated for:', url);
//         const response = await window.parent.electronAPI.fetch(url, options);
//         console.log('Fetch response received:', response);

//         // Create a Response-like object from the IPC result
//         return {
//           ok: response.ok,
//           status: response.status,
//           statusText: response.statusText,
//           headers: new Headers(response.headers || {}),
//           json: () => Promise.resolve(response.data),
//           text: () => Promise.resolve(typeof response.data === 'string' ? 
//             response.data : JSON.stringify(response.data)),
//           url: response.url
//         };
//       } catch (error) {
//         console.error('Fetch error:', error);
//         throw new Error(error instanceof Error ? error.message : 'Network request failed');
//       }
//     };

//     // Add axios-like request capability
//     window.request = async function(config) {
//       try {
//         console.log('Request initiated for:', config.url);
//         const result = await window.parent.electronAPI.request(config);
//         console.log('Request response received:', result);
//         return result;
//       } catch (error) {
//         console.error('Request error:', error);
//         throw error;
//       }
//     };

//     // Let the app know these capabilities are available
//     window.appNetworkCapabilities = {
//       fetch: true,
//       request: true
//     };

//     console.log('Network capabilities initialized for embedded app');
//   `;

//   // Create a complete HTML string with proper structure and network capabilities
//   const htmlContent = `
//     <!DOCTYPE html>
//     <html>
//     <head>
//       <meta charset="UTF-8">
//       <meta name="viewport" content="width=device-width, initial-scale=1.0">
//       <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src *">
//       <title>Generated App</title>
//       <style>${appData.styles}</style>
//       <script>${networkProxyScript}</script>
//     </head>
//     <body>
//       ${appData.html}
//       <script>${appData.logic}</script>
//     </body>
//     </html>
//   `;

//   // Use srcdoc instead of document.write to avoid the same-origin issue
//   const frame = document.createElement('iframe');
//   frame.style.width = '100%';
//   frame.style.height = '100%';
//   frame.style.border = 'none';
//   // Important: allow-scripts and allow-same-origin are needed for the network proxy to work
//   frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin');
//   frame.srcdoc = htmlContent;

//   // Add the iframe to the container
//   appContainer.appendChild(frame);

//   // Remove the placeholder content
//   const placeholder = document.querySelector('.placeholder-content');
//   if (placeholder) {
//     (placeholder as HTMLElement).style.display = 'none';
//   }
// }

/**
 * Displays the generated app in the container and enables fullscreen functionality
 * @param appData The HTML, CSS, and JS for the app
 */
function displayGeneratedApp(appData: AppData) {
  const appContainer = document.getElementById('generated-app-container');
  if (!appContainer) {
    console.error('App container not found');
    return;
  }

  // Clear the container except for the controls
  const appControls = appContainer.querySelector('.app-controls');
  appContainer.innerHTML = '';

  // Re-add the app controls if they existed
  if (appControls) {
    appContainer.appendChild(appControls);
  }

  // Create the network proxy script
  const networkProxyScript = `
    // Override fetch API to use IPC bridge
    window.originalFetch = window.fetch;
    window.fetch = async function(url, options = {}) {
      try {
        console.log('Fetch request initiated for:', url);
        const response = await window.parent.electronAPI.fetch(url, options);
        console.log('Fetch response received:', response);
        
        // Create a Response-like object from the IPC result
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers || {}),
          json: () => Promise.resolve(response.data),
          text: () => Promise.resolve(typeof response.data === 'string' ? 
            response.data : JSON.stringify(response.data)),
          url: response.url
        };
      } catch (error) {
        console.error('Fetch error:', error);
        throw new Error(error instanceof Error ? error.message : 'Network request failed');
      }
    };
    
    // Add axios-like request capability
    window.request = async function(config) {
      try {
        console.log('Request initiated for:', config.url);
        const result = await window.parent.electronAPI.request(config);
        console.log('Request response received:', result);
        return result;
      } catch (error) {
        console.error('Request error:', error);
        throw error;
      }
    };
    
    // Let the app know these capabilities are available
    window.appNetworkCapabilities = {
      fetch: true,
      request: true
    };
    
    console.log('Network capabilities initialized for embedded app');
  `;

  // Create a complete HTML string with proper structure and network capabilities
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src * self blob: data: gap:; style-src * self 'unsafe-inline' blob: data: gap:; script-src * 'self' 'unsafe-eval' 'unsafe-inline' blob: data: gap: https://cdn.tailwindcss.com https://cdn.jsdelivr.net; object-src * 'self' blob: data: gap:; img-src * self 'unsafe-inline' blob: data: gap:; connect-src self * 'unsafe-inline' blob: data: gap:; frame-src * self blob: data: gap:;">
      <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
      <title>Generated App</title>
      <style>${appData.styles}</style>
      <script>${networkProxyScript}</script>

      <style type="text/tailwindcss">
        @theme {
          --color-clifford: #da373d;
        }
        
        @layer base {
          :root {
            --tw-bg-primary: var(--bg-primary);
            --tw-bg-secondary: var(--bg-secondary);
            --tw-bg-tertiary: var(--bg-tertiary);
            --tw-accent-primary: var(--accent-primary);
            --tw-accent-secondary: var(--accent-secondary);
            --tw-accent-tertiary: var(--accent-tertiary);
            --tw-text-primary: var(--text-primary);
            --tw-text-secondary: var(--text-secondary);
            --tw-text-tertiary: var(--text-tertiary);
          }
        }
        
        @layer utilities {
          .bg-app-primary {
            background-color: var(--bg-primary);
          }
          .bg-app-secondary {
            background-color: var(--bg-secondary);
          }
          .bg-app-tertiary {
            background-color: var(--bg-tertiary);
          }
          .text-app-primary {
            color: var(--text-primary);
          }
          .text-app-secondary {
            color: var(--text-secondary);
          }
          .text-app-tertiary {
            color: var(--text-tertiary);
          }
          .accent-app-primary {
            color: var(--accent-primary);
          }
          .border-app {
            border-color: var(--border-color);
          }
          .shadow-app-sm {
            box-shadow: var(--shadow-sm);
          }
          .shadow-app-md {
            box-shadow: var(--shadow-md);
          }
          .shadow-app-lg {
            box-shadow: var(--shadow-lg);
          }
          .rounded-app-sm {
            border-radius: var(--border-radius-sm);
          }
          .rounded-app-md {
            border-radius: var(--border-radius-md);
          }
          .rounded-app-lg {
            border-radius: var(--border-radius-lg);
          }
        }
        
        tailwind.config = {
          theme: {
            extend: {
              colors: {
                primary: 'var(--accent-primary)',
                secondary: 'var(--accent-secondary)',
                tertiary: 'var(--accent-tertiary)',
                success: 'var(--success)',
                warning: 'var(--warning)',
                error: 'var(--error)'
              },
              backgroundColor: {
                primary: 'var(--bg-primary)',
                secondary: 'var(--bg-secondary)',
                tertiary: 'var(--bg-tertiary)',
                card: 'var(--card-bg)',
                input: 'var(--input-bg)',
                hover: 'var(--hover-bg)',
                glass: 'var(--glass-bg)'
              },
              textColor: {
                primary: 'var(--text-primary)',
                secondary: 'var(--text-secondary)',
                tertiary: 'var(--text-tertiary)'
              },
              borderColor: {
                DEFAULT: 'var(--border-color)',
                glass: 'var(--glass-border)'
              },
              borderRadius: {
                'sm': 'var(--border-radius-sm)',
                'md': 'var(--border-radius-md)',
                'lg': 'var(--border-radius-lg)',
                'xl': 'var(--border-radius-xl)'
              },
              boxShadow: {
                'sm': 'var(--shadow-sm)',
                DEFAULT: 'var(--shadow-md)',
                'md': 'var(--shadow-md)',
                'lg': 'var(--shadow-lg)',
                'focus': 'var(--shadow-focus)'
              },
              spacing: {
                'xs': 'var(--spacing-xs)',
                'sm': 'var(--spacing-sm)',
                'md': 'var(--spacing-md)',
                'lg': 'var(--spacing-lg)',
                'xl': 'var(--spacing-xl)',
                'xxl': 'var(--spacing-xxl)'
              },
              transitionDuration: {
                'fast': 'var(--transition-fast)',
                'medium': 'var(--transition-medium)',
                'slow': 'var(--transition-slow)'
              }
            }
          }
        }
      </style>
    </head>
    <body>
      ${appData.html}
      <script>${appData.logic}</script>
    </body>
    </html>
  `;

  // Use srcdoc instead of document.write to avoid the same-origin issue
  const frame = document.createElement('iframe');
  frame.style.width = '100%';
  frame.style.height = '100%';
  frame.style.border = 'none';
  // Important: allow-scripts and allow-same-origin are needed for the network proxy to work
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin');
  frame.srcdoc = htmlContent;

  // Add the iframe to the container
  appContainer.appendChild(frame);

  // Make sure the fullscreen button is visible
  const fullscreenBtn = document.getElementById('app-fullscreen-btn');
  if (!appContainer.querySelector('.app-controls') && fullscreenBtn) {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'app-controls';
    controlsDiv.appendChild(fullscreenBtn.cloneNode(true));
    appContainer.appendChild(controlsDiv);

    // Re-attach event listener to the new button
    appContainer.querySelector('.app-controls .fullscreen-btn').addEventListener('click', () => {
      enterAppFullscreen(frame);
    });
  }

  // Remove the placeholder content
  const placeholder = document.querySelector('.placeholder-content');
  if (placeholder) {
    (placeholder as any).style.display = 'none';
  }
}

/**
 * Enters fullscreen mode for the generated app
 * @param appIframe The iframe containing the app
 */
function enterAppFullscreen(appIframe: any) {
  if (!appIframe) {
    showToast('No app available to view in fullscreen');
    return;
  }

  const appFullscreenContainer = document.getElementById('app-fullscreen-container');
  const appFullscreenContent = document.getElementById('app-fullscreen-content');

  if (!appFullscreenContainer || !appFullscreenContent) {
    console.error('Fullscreen container elements not found');
    return;
  }

  // Clone the iframe for fullscreen view
  const clonedIframe = appIframe.cloneNode(true);
  clonedIframe.style.width = '100%';
  clonedIframe.style.height = '100%';
  clonedIframe.style.border = 'none';

  // Clear any previous content and add the cloned iframe
  appFullscreenContent.innerHTML = '';
  appFullscreenContent.appendChild(clonedIframe);

  // Show the fullscreen container
  appFullscreenContainer.style.display = 'block';

  showToast('Entered fullscreen mode');
}

/**
 * Enters fullscreen mode for the webview
 */
function enterWebviewFullscreen() {
  const webview = document.getElementById('webview');
  if (!webview) {
    showToast('Webview not available');
    return;
  }

  const webviewFullscreenContainer = document.getElementById('webview-fullscreen-container');
  const webviewFullscreenContent = document.getElementById('webview-fullscreen-content');

  if (!webviewFullscreenContainer || !webviewFullscreenContent) {
    console.error('Webview fullscreen container elements not found');
    return;
  }

  // Create a new webview for fullscreen to preserve the state
  const fullscreenWebview = document.createElement('webview');
  fullscreenWebview.setAttribute('src', webview.getAttribute('src'));
  fullscreenWebview.setAttribute('allowpopups', '');
  fullscreenWebview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, enableRemoteModule=no');
  fullscreenWebview.setAttribute('partition', 'persist:walletview');
  fullscreenWebview.style.width = '100%';
  fullscreenWebview.style.height = '100%';
  fullscreenWebview.style.border = 'none';

  // Set the preload script if it was set on the original webview
  if (webview.getAttribute('preload')) {
    fullscreenWebview.setAttribute('preload', webview.getAttribute('preload'));
  }

  // Clear any previous content and add the new webview
  webviewFullscreenContent.innerHTML = '';
  webviewFullscreenContent.appendChild(fullscreenWebview);

  // Show the fullscreen container
  webviewFullscreenContainer.style.display = 'block';

  showToast('Entered fullscreen mode');

  // Set up event listeners for the new webview
  fullscreenWebview.addEventListener('did-start-loading', function () {
    showToast('Loading...');
  });

  fullscreenWebview.addEventListener('did-finish-load', function () {
    showToast('Loaded');

    // Attempt to inject the Ethereum provider
    if (window.webviewHandler) {
      try {
        // We need to identify this webview for injection
        fullscreenWebview.id = 'fullscreen-webview';
        window.webviewHandler.injectProvider('fullscreen-webview');
      } catch (e) {
        console.error('Error injecting provider into fullscreen webview:', e);
      }
    }
  });
}

// Helper functions
function updateStatus(message: string): void {
  statusElement.textContent = message;
}

function showNotification(message: string): void {
  // Create a notification element
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;

  // Add it to the body
  document.body.appendChild(notification);

  // Remove it after 3 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 500);
  }, 3000);
}

function showLoadingIndicator(): void {
  // Replace the placeholder with a loading animation
  appContainer.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Generating your app...</p>
    </div>
  `;
}

function hideLoadingIndicator(): void {
  // We'll replace this when the app loads, so no need to do anything here
}

// WEB3 Wallet:
interface EthereumRequest {
  id: string;
  payload: {
    method: string;
    params: any[];
  };
}

// DOM Elements
const webview = document.getElementById('webview') as Electron.WebviewTag;
const addressDisplay = document.getElementById('address') as HTMLDivElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const navigateButton = document.getElementById('navigate') as HTMLButtonElement;
const siteButtons = document.querySelectorAll('.site-btn') as NodeListOf<HTMLButtonElement>;
const connectionStatus = document.getElementById('connection-status') as HTMLDivElement;
const loadingIndicator = document.getElementById('loading-indicator') as HTMLDivElement;

// Initialize the webview with the provider injection
if (window.webviewHandler) {
  window.webviewHandler.injectProvider('webview');
}

// Display the wallet address
async function displayAddress(): Promise<void> {
  try {
    if (window.walletAPI) {
      const address = await window.walletAPI.getAddress();
      if (addressDisplay) {
        addressDisplay.textContent = address || 'Address not available';
      }
    }
  } catch (error) {
    console.error('Error getting address:', error);
    if (addressDisplay) {
      addressDisplay.textContent = 'Error loading address';
    }
  }
}

// Navigate to a URL
function navigateTo(url: string): void {
  if (!webview) {
    console.error('Webview not found');
    return;
  }

  try {
    // Make sure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    webview.src = url;
    if (urlInput) {
      urlInput.value = url;
    }

    // Show loading indicator
    if (loadingIndicator) {
      loadingIndicator.classList.add('active');
    }
  } catch (error) {
    console.error('Error navigating to URL:', error);
    showNotification('Failed to navigate to ' + url);
  }
}

// Set up event listeners
document.addEventListener('DOMContentLoaded', function () {
  // Make sure webview is properly initialized
  if (webview) {
    // Set the preload script path explicitly
    const preloadPath = 'webview-preload.js'; // Adjust the path according to your build process
    webview.setAttribute('preload', preloadPath);

    // Set up webview event listeners
    webview.addEventListener('did-start-loading', function () {
      if (loadingIndicator) {
        loadingIndicator.classList.add('active');
      }
    });

    webview.addEventListener('did-stop-loading', function () {
      if (loadingIndicator) {
        loadingIndicator.classList.remove('active');
      }
    });

    webview.addEventListener('did-finish-load', function () {
      console.log('Webview finished loading');
      // Try to inject the provider again after load
      if (window.webviewHandler) {
        window.webviewHandler.injectProvider('webview');
      }

      // Show wallet connection status
      setTimeout(() => {
        if (connectionStatus) {
          connectionStatus.classList.add('show');
          setTimeout(() => {
            connectionStatus.classList.remove('show');
          }, 3000);
        }
      }, 1000);
    });

    webview.addEventListener('did-fail-load', function (event) {
      console.error('Webview failed to load:', event);
      if (loadingIndicator) {
        loadingIndicator.classList.remove('active');
      }
      showNotification(`Failed to load: ${event.errorDescription || 'Unknown error'}`);
    });

    // Update URL bar when webview navigates
    webview.addEventListener('did-navigate', (event) => {
      if (urlInput && event.url) {
        urlInput.value = event.url;
      }
    });

    // Initial navigation
    if (webview.src) {
      console.log('Initial webview URL:', webview.src);
    } else {
      // Set a default URL if none is set
      navigateTo('https://app.uniswap.org');
    }
  }

  // Display wallet address
  displayAddress();
});

// Handle navigation button click
if (navigateButton) {
  navigateButton.addEventListener('click', () => {
    if (urlInput) {
      navigateTo(urlInput.value);
    }
  });
}

// Handle URL input enter key
if (urlInput) {
  urlInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      navigateTo(urlInput.value);
    }
  });
}

// Handle site buttons
siteButtons.forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.url) {
      navigateTo(button.dataset.url);
    }
  });
});

// Set up messaging with webview
if (webview) {
  webview.addEventListener('ipc-message', (event) => {
    if (event.channel === 'ethereum-request') {
      handleEthereumRequest(event.args[0] as EthereumRequest);
    }
  });

  // Listen for webview console messages (helpful for debugging)
  webview.addEventListener('console-message', (event) => {
    console.log('WebView console:', event.message);
  });
}

// Handle requests from the webview
async function handleEthereumRequest({ id, payload }: EthereumRequest): Promise<void> {
  if (!webview || !window.walletAPI) {
    console.error('Webview or walletAPI not available');
    return;
  }

  try {
    let result: any;

    switch (payload.method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        result = [await window.walletAPI.getAddress()];
        break;

      case 'eth_chainId':
        const chainIdDec = await window.walletAPI.getChainId();
        result = '0x' + chainIdDec.toString(16);
        break;

      case 'eth_signMessage':
      case 'personal_sign':
        // TODO: Add confirmation dialog here
        result = await window.walletAPI.signMessage(payload.params[1] || payload.params[0]);
        break;

      case 'eth_sendTransaction':
        // TODO: Add transaction confirmation dialog here
        result = await window.walletAPI.sendTransaction(payload.params[0]);
        break;

      default:
        throw new Error(`Method ${payload.method} not supported by Electron Wallet`);
    }

    // Send response back to webview
    webview.send('ethereum-response', { id, result });
  } catch (error) {
    if (error instanceof Error) {
      webview.send('ethereum-response', { id, error: error.message });
    } else {
      webview.send('ethereum-response', { id, error: 'Unknown error' });
    }
  }
}

// Copy address functionality
const copyBtn = document.getElementById('copy-address');
if (copyBtn && addressDisplay) {
  copyBtn.addEventListener('click', () => {
    const address = addressDisplay.textContent;
    if (address && address !== 'Loading address...' && address !== 'Error loading address') {
      // Use clipboard API if available
      if (navigator.clipboard) {
        navigator.clipboard.writeText(address)
          .then(() => showToast('Address copied to clipboard'))
          .catch(() => showToast('Failed to copy address'));
      } else {
        // Fallback copy method
        const textarea = document.createElement('textarea');
        textarea.value = address;
        textarea.style.position = 'fixed';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          showToast('Address copied to clipboard');
        } catch (err) {
          showToast('Failed to copy address');
        }
        document.body.removeChild(textarea);
      }
    }
  });
}

// Toast notification functionality
function showToast(message: string) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
  .notification {
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: var(--glass-bg);
    backdrop-filter: blur(10px);
    border-radius: 8px;
    border: 1px solid var(--glass-border);
    color: var(--text-primary);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    animation: slide-in 0.3s ease;
  }
  
  .notification.fade-out {
    animation: slide-out 0.5s ease;
  }
  
  .loading-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  
  .loading-spinner {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 4px solid rgba(255, 255, 255, 0.1);
    border-top: 4px solid var(--accent-primary);
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  @keyframes slide-in {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  @keyframes slide-out {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);