import { app, BrowserWindow, ipcMain, session } from 'electron';
import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import https from 'https';
import * as ethers from 'ethers';

// Setup for Anthropic's Claude API
import Anthropic from '@anthropic-ai/sdk';

require('dotenv').config()

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Initialize Anthropic with your API key
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // Make sure to add this to your .env file
});

// Updated system prompt optimized for Claude
const updatedSystemPrompt = `You are an expert UI/UX designer and developer specializing in futuristic mini-applications. Your goal is to create a fully functional mini-app based on the user's request while ensuring a smooth and visually appealing experience.  

## Key Enhancements for the Mini-App:  

1. **Intuitive UI/UX:**  
   - Clean, modern, and futuristic design with smooth animations and interactive elements.  
   - Responsive layout that adapts to different screen sizes.  
   - Light-themed design system for a visually appealing interface.  

2. **Functionality & Features:**  
   - Implement the main requested functionality effectively.  
   - Include necessary sideline features that enhance usability, such as input validation, loading indicators, and success/error toasts.  
   - Provide real-time interactivity and smooth user feedback.  

3. **Integration with APIs (if applicable):**  
   - Support for **IPFS uploads** using the provided API:  
     
     curl -X POST -H "Content-Type: application/json" -d '{"query": "Upload this data to IPFS: your string here"}' https://backend-b2mv.onrender.com/api/agent
     
   - Support for **posting to Farcaster** using the provided API:  
     
     curl -X POST -H "Content-Type: application/json" -d '{"query": "Post this to Farcaster: Hello from agent!"}' https://backend-b2mv.onrender.com/api/agent
     
   - Handle API responses gracefully and display relevant messages to the user.  

4. **Styling & Design Guidelines:**  
   - Use CSS variables to maintain consistency:  

     /* Core colors */
     var(--accent-primary);
     var(--accent-secondary);
     var(--bg-primary);
     var(--text-primary);

     /* Spacing */
     var(--spacing-xs);
     var(--spacing-sm);
     var(--spacing-md);
     var(--spacing-lg);
     
   - Use tailwindcss as much you like, to ensure a good ui & less css needed.
   - Apply subtle gradients, box shadows, and smooth transitions to create a futuristic look.  
   - Use card-based layouts, clear typography, and well-defined call-to-action buttons.  

## Expected JSON Output:  
Your response MUST be a valid JSON object with these three properties:  

1. **"html"** → The HTML structure of the app. (Valid HTML only)  
2. **"styles"** → CSS styles for the app. (Valid CSS only)  
3. **"logic"** → JavaScript code that implements the app’s functionality. (Valid JavaScript only)  

### Formatting Rules:  
- Escape all double quotes inside string values with backslashes: \"  
- Do **not** use single quotes for JSON property names.  
- Ensure all code is properly formatted and syntactically valid.  
- The app should work seamlessly within an **Electron** environment.  

## Example Output:  
{
  "html": "<div id=\\"app\\">...</div>",
  "styles": "body { font-family: sans-serif; }",
  "logic": "document.addEventListener(\\"DOMContentLoaded\\", function() { ... });"
}

Return valid JSON with properly escaped special characters (\n, \t, \r, \", \\) and no unescaped control characters. All string values containing code must have doubled backslashes where needed.
`;

// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
// plugin that tells the Electron app where to look for the Webpack-bundled app code (depending on
// whether you're running in development or production).
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = (): void => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src * 'self' blob: data:; style-src * 'self' 'unsafe-inline' blob: data:; script-src * 'self' 'unsafe-eval' 'unsafe-inline' blob: data: https://cdn.tailwindcss.com https://cdn.jsdelivr.net; object-src * 'self' blob: data:; img-src * 'self' 'unsafe-inline' blob: data:; connect-src * 'self' 'unsafe-inline' blob: data:; frame-src * 'self' blob: data:"
        ]
      }
    });
  });

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      // nodeIntegration: false,
      // contextIsolation: true,
      webviewTag: true, // Important: Enable webview tag
      sandbox: false,
    },
  });

  
  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// Handle app prompt requests
ipcMain.handle('generate-app', async (event, prompt) => {
  try {
    // Get the app design and logic from OpenAI
    const appSpec = await generateAppFromPrompt(prompt);

    // Make sure we have valid content for all fields
    // This prevents the ERR_INVALID_ARG_TYPE error
    const safeAppSpec = {
      html: typeof appSpec.html === 'string' ? appSpec.html : '<div id="app">App content</div>',
      styles: typeof appSpec.styles === 'string' ? appSpec.styles : 'body { font-family: sans-serif; }',
      logic: typeof appSpec.logic === 'string' ? appSpec.logic : 'console.log("App initialized");'
    };

    // Create a temporary directory for the app
    const appDir = path.join(app.getPath('temp'), `app-${Date.now()}`);
    fs.mkdirSync(appDir, { recursive: true });

    // Write app files with explicit string conversion as a safety measure
    fs.writeFileSync(path.join(appDir, 'app.js'), String(safeAppSpec.logic));
    fs.writeFileSync(path.join(appDir, 'app.css'), String(safeAppSpec.styles));
    fs.writeFileSync(path.join(appDir, 'app.html'), String(safeAppSpec.html));

    return {
      success: true,
      appPath: appDir,
      appData: safeAppSpec
    };
  } catch (error) {
    console.error('Error generating app:', error);

    // Create a fallback app if there's an error
    const fallbackApp = {
      html: `<div class="ai-app-wrapper">
              <header class="ai-app-header">App Generation Error</header>
              <main class="ai-app-content">
                <h2>Sorry, there was an error generating your app</h2>
                <p>Error details: ${error.message}</p>
                <button id="tryAgainBtn">Try Again</button>
              </main>
              <footer class="ai-app-footer">
                Please try a different prompt or try again later
              </footer>
            </div>`,
      styles: `
        .ai-app-wrapper {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          padding: 20px;
          text-align: center;
          background: #f8f9fa;
          height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .ai-app-header {
          font-size: 24px;
          color: #6366f1;
          margin-bottom: 20px;
        }
        .ai-app-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .ai-app-footer {
          margin-top: 20px;
          color: #6b7280;
          font-size: 14px;
        }
        button {
          background: #6366f1;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          margin-top: 20px;
        }
        button:hover {
          background: #4f46e5;
        }
      `,
      logic: `
        document.getElementById('tryAgainBtn').addEventListener('click', function() {
          window.parent.location.reload();
        });
      `
    };

    try {
      // Create a fallback app directory
      const fallbackDir = path.join(app.getPath('temp'), `fallback-app-${Date.now()}`);
      fs.mkdirSync(fallbackDir, { recursive: true });

      // Write fallback files
      fs.writeFileSync(path.join(fallbackDir, 'app.js'), fallbackApp.logic);
      fs.writeFileSync(path.join(fallbackDir, 'app.css'), fallbackApp.styles);
      fs.writeFileSync(path.join(fallbackDir, 'app.html'), fallbackApp.html);

      return {
        success: false,
        error: error.message,
        appPath: fallbackDir,
        appData: fallbackApp
      };
    } catch (fallbackError) {
      console.error('Error creating fallback app:', fallbackError);
      return {
        success: false,
        error: `${error.message} (and fallback creation failed)`
      };
    }
  }
});

/**
 * A robust parser for Claude API responses that can extract app data even from 
 * malformed JSON or markdown-formatted responses
 */
function parseAppDataFromResponse(responseContent: string): { html: string; styles: string; logic: string } {
  // Default empty app
  const defaultApp = {
    html: '<div class="ai-app-wrapper"><main class="ai-app-content"><p>App content</p></main></div>',
    styles: 'body { font-family: system-ui, sans-serif; }',
    logic: 'console.log("App initialized");'
  };

  // If response is empty, return default
  if (!responseContent) {
    console.warn('Empty response from Claude');
    return defaultApp;
  }

  try {
    // First try: direct JSON parsing
    try {
      // Clean up any markdown formatting artifacts
      let cleanJson = responseContent.trim();

      // Remove markdown code block markers if present
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');

      const parsed = JSON.parse(cleanJson);

      // Validate that we have the required properties
      if (typeof parsed.html === 'string' &&
        typeof parsed.styles === 'string') {
        return {
          html: parsed.html,
          styles: parsed.styles,
          logic: typeof parsed.logic === 'string' ? parsed.logic : defaultApp.logic
        };
      }
    } catch (error) {
      console.warn('Initial JSON parsing failed, attempting regex extraction:', error.message);
    }

    // Check if we have code blocks for each component
    let html = defaultApp.html;
    let styles = defaultApp.styles;
    let logic = defaultApp.logic;

    // Claude often returns code blocks, so look for those first
    const htmlCodeBlock = responseContent.match(/```html\n([\s\S]*?)```/);
    if (htmlCodeBlock && htmlCodeBlock[1]) {
      html = htmlCodeBlock[1];
    }

    const cssCodeBlock = responseContent.match(/```css\n([\s\S]*?)```/);
    if (cssCodeBlock && cssCodeBlock[1]) {
      styles = cssCodeBlock[1];
    }

    const jsCodeBlock = responseContent.match(/```(javascript|js)\n([\s\S]*?)```/);
    if (jsCodeBlock && jsCodeBlock[2]) {
      logic = jsCodeBlock[2];
    }

    // If we found code blocks, use those
    if (html !== defaultApp.html || styles !== defaultApp.styles || logic !== defaultApp.logic) {
      return { html, styles, logic };
    }

    // Second try: Extract using JSON property regex
    // Extract HTML section using regex
    const htmlMatch = responseContent.match(/"html"\s*:\s*"((?:\\"|[^"])*?)(?<!\\)"/);
    if (htmlMatch && htmlMatch[1]) {
      html = htmlMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\');
    }

    // Extract CSS section using regex
    const stylesMatch = responseContent.match(/"styles"\s*:\s*"((?:\\"|[^"])*?)(?<!\\)"/);
    if (stylesMatch && stylesMatch[1]) {
      // Only use the first 2000 chars of CSS to avoid corrupted content
      styles = stylesMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\')
        .substring(0, 2000);

      // If CSS is clearly corrupted (contains lots of random words), use default
      if (styles.includes('system') && styles.includes('identity') &&
        styles.match(/[a-zA-Z]{20,}/)) {
        console.warn('CSS appears corrupted, using default styles');
        styles = defaultApp.styles;
      }
    }

    // Extract JS section using regex
    const logicMatch = responseContent.match(/"logic"\s*:\s*"((?:\\"|[^"])*?)(?<!\\)"/);
    if (logicMatch && logicMatch[1]) {
      logic = logicMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\');
    }

    return { html, styles, logic };
  } catch (error) {
    console.error('Failed to parse app data:', error);
    return defaultApp;
  }
}

// Function to generate app from prompt using OpenAI
async function generateAppFromPrompt(prompt: string) {
  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-latest", // You can also use "claude-3-opus-20240229" for higher quality or "claude-3-haiku-20240307" for faster responses
    max_tokens: 4090,
    temperature: 0.5,
    system: updatedSystemPrompt,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  // Extract the response content

  let responseContent = '';
  const textBlock = message.content.find((item) => item.type === 'text');
  if (textBlock && 'text' in textBlock) {
    responseContent = textBlock.text;
    console.log('response', responseContent)
  } else {
    console.warn('No text block found in Claude response');
  }

  // First, try to find and extract JSON from the response
  // Claude often wraps JSON in markdown code blocks
  let jsonContent = responseContent;

  // Look for JSON code blocks in markdown format
  const jsonBlockMatch = responseContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    jsonContent = jsonBlockMatch[1];
  }

  // Use our robust parser to extract app data even from malformed JSON
  const appData = parseAppDataFromResponse(jsonContent);

  // Validate the extracted app data
  const validHtml = appData.html && appData.html.trim().length > 0;
  const validCss = appData.styles && appData.styles.trim().length > 0;
  const validJs = appData.logic && appData.logic.trim().length > 0;

  console.log(`App data validation: HTML: ${validHtml}, CSS: ${validCss}, JS: ${validJs}`);

  // Return the app data
  return appData;

  // const completion = await openai.chat.completions.create({
  //   model: "gpt-4-turbo",
  //   messages: [
  //     {
  //       role: "system",
  //       content: updatedSystemPrompt
  //     },
  //     {
  //       role: "user",
  //       content: prompt
  //     }
  //   ],
  //   temperature: 1.5,
  //   max_completion_tokens: 4000,
  //   response_format: { type: "json_object" }
  // });

  // console.log(completion.choices[0].message.content)

  // return JSON.parse(completion.choices[0].message.content);
}

// Load and run the generated app - EMBEDDED ONLY VERSION
ipcMain.handle('run-app', (event, appPath) => {
  // We don't create a new window here anymore
  // Just return the app data so it can be displayed in the main window
  const htmlPath = path.join(appPath, 'app.html');
  const cssPath = path.join(appPath, 'app.css');
  const jsPath = path.join(appPath, 'app.js');

  try {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const styles = fs.readFileSync(cssPath, 'utf8');
    const logic = fs.readFileSync(jsPath, 'utf8');

    return {
      success: true,
      appData: { html, styles, logic }
    };
  } catch (error) {
    console.error('Error loading app files:', error);
    return { success: false, error: error.message };
  }
});
// Add network request handlers for embedded apps
// Handler for fetch API requests from embedded apps
ipcMain.handle('app-fetch', async (event, url, options = {}) => {
  try {
    console.log(`Fetch request to: ${url}`);

    // Use axios for the actual request since it's more robust in Node.js environment
    const response = await axios({
      url: url,
      method: options.method || 'GET',
      headers: options.headers || {},
      data: options.body ? JSON.parse(options.body) : undefined,
      params: options.params,
      responseType: 'text',
      httpsAgent: new https.Agent({
        rejectUnauthorized: true // Enforce SSL verification
      })
    });

    // Try to parse response as JSON if possible
    let parsedData;
    try {
      parsedData = JSON.parse(response.data);
    } catch (e) {
      parsedData = response.data;
    }

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: parsedData,
      url: response.config.url
    };
  } catch (error) {
    console.error('Error in app-fetch:', error.message);
    return {
      ok: false,
      status: error.response?.status || 0,
      statusText: error.message,
      error: true,
      message: error.message
    };
  }
});

// Handler for more complex axios-like requests from embedded apps
ipcMain.handle('app-request', async (event, config) => {
  try {
    console.log(`Request to: ${config.url}`);

    // Create custom axios instance with ability to ignore SSL issues if needed
    const axiosInstance = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: config.rejectUnauthorized !== false
      })
    });

    const response = await axiosInstance(config);

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      config: response.config
    };
  } catch (error) {
    console.error('Error in app-request:', error.message);
    return {
      success: false,
      error: true,
      status: error.response?.status || 0,
      statusText: error.response?.statusText || error.message,
      message: error.message,
      code: error.code
    };
  }
});


// Handle wallet operations in the main process
ipcMain.handle('get-wallet-address', async () => {
  try {
    const wallet = ethers.Wallet.fromPhrase(process.env.MNEMONIC);
    return wallet.address;
  } catch (error) {
    console.error('Error getting wallet address:', error);
    return null;
  }
});

ipcMain.handle('sign-message', async (event, message) => {
  try {
    const wallet = ethers.Wallet.fromPhrase(process.env.MNEMONIC);
    const signature = await wallet.signMessage(message);
    return signature;
  } catch (error) {
    console.error('Error signing message:', error);
    return null;
  }
});

ipcMain.handle('sign-transaction', async (event, txData) => {
  try {
    const wallet = ethers.Wallet.fromPhrase(process.env.MNEMONIC);
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`);
    const connectedWallet = wallet.connect(provider);

    const signedTx = await connectedWallet.signTransaction(txData);
    return signedTx;
  } catch (error) {
    console.error('Error signing transaction:', error);
    return null;
  }
});

ipcMain.handle('send-transaction', async (event, txData) => {
  try {
    const wallet = ethers.Wallet.fromPhrase(process.env.MNEMONIC);
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`);
    const connectedWallet = wallet.connect(provider);

    const tx = await connectedWallet.sendTransaction(txData);
    return tx.hash;
  } catch (error) {
    console.error('Error sending transaction:', error);
    return null;
  }
});

// Get chain information
ipcMain.handle('get-chain-id', async () => {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`);
    const network = await provider.getNetwork();
    return network.chainId;
  } catch (error) {
    console.error('Error getting chain ID:', error);
    return 1; // Default to Ethereum mainnet
  }
});

ipcMain.handle('wallet-request', async (event, args) => {
  const { method, params } = args;
  const provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`);
  await provider.ready;
  const wallet = new ethers.Wallet(process.env.MNEMONIC, provider);
  try {
    switch (method) {
      case 'eth_requestAccounts':
        return [wallet.address];
      case 'eth_sendTransaction':
        const tx = params[0];
        const txResponse = await wallet.sendTransaction(tx);
        return txResponse.hash;
      case 'eth_sign':
        const [address, message] = params;
        if (address.toLowerCase() !== wallet.address.toLowerCase()) {
          throw new Error('Invalid address');
        }
        return wallet.signMessage(message);
      case 'eth_chainId':
        return (await provider.getNetwork()).chainId.toString(16); // Hex string
      case 'eth_blockNumber':
        return (await provider.getBlockNumber()).toString(16); // Hex string
      default:
        throw new Error(`Method ${method} not supported`);
    }
  } catch (error) {
    throw error;
  }
});
