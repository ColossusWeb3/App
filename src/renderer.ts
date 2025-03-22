/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/latest/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';
// renderer.ts - Frontend logic for The Future Computer

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

// Augment the window object with our custom properties
declare global {
  interface Window {
    electronAPI: ElectronAPI;
    originalFetch: typeof fetch;
    request: (config: RequestConfig) => Promise<any>;
    appNetworkCapabilities: {
      fetch: boolean;
      request: boolean;
    };
  }
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
function displayGeneratedApp(appData: AppData): void {
  // Clear the container
  appContainer.innerHTML = '';
  
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
      <title>Generated App</title>
      <style>${appData.styles}</style>
      <script>${networkProxyScript}</script>
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
  
  // Remove the placeholder content
  const placeholder = document.querySelector('.placeholder-content');
  if (placeholder) {
    (placeholder as HTMLElement).style.display = 'none';
  }
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