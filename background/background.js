// background/background.js

let monitoringInterval = null;
let resourceData = {};
let memoryHistory = [];
const MAX_HISTORY = 20; // Stores up to 20 monitoring points for the chart

// Default settings (User-friendly units: seconds, minutes, MB)
let settings = {
  monitoringInterval: 5, // seconds
  highMemoryThreshold: 500, // MB
  mediumMemoryThreshold: 100, // MB
  autoSuspendEnabled: false,
  autoSuspendDelay: 30, // minutes
  showBadge: true,
  defaultSort: 'memory',
  showChart: true
};

// Internal settings converted to correct units (milliseconds, bytes)
let internalSettings = {};

// Load settings from storage and convert units
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    
    // Overwrite defaults with stored settings if they exist
    if (result.settings) {
      settings = { ...settings, ...result.settings };
    }

    // Convert stored user-friendly settings into operational, internal units
    internalSettings = {
      // Convert seconds to milliseconds
      monitoringInterval: settings.monitoringInterval * 1000,
      // Convert MB to bytes
      highMemoryThreshold: settings.highMemoryThreshold * 1024 * 1024,
      // Convert MB to bytes
      mediumMemoryThreshold: settings.mediumMemoryThreshold * 1024 * 1024,
      autoSuspendEnabled: settings.autoSuspendEnabled,
      // Convert minutes to milliseconds
      autoSuspendDelay: settings.autoSuspendDelay * 60 * 1000,
      showBadge: settings.showBadge
    };

    console.log('Settings loaded and converted:', internalSettings);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Start monitoring based on current settings
function startMonitoring() {
  // Clear any existing interval
  if (monitoringInterval !== null) {
    clearInterval(monitoringInterval);
  }
  
  // Monitor using the configured internal interval (in ms)
  monitoringInterval = setInterval(async () => {
    await collectResourceData();
  }, internalSettings.monitoringInterval);
  
  console.log(`Monitoring started with interval: ${internalSettings.monitoringInterval}ms`);
}

// Load settings and start monitoring when extension is installed or updated
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Performance Monitor installed/updated');
  await loadSettings();
  startMonitoring();
});

// Listen for messages from the popup/options pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateSettings') {
    // Load new settings, then restart monitoring
    loadSettings().then(() => {
      startMonitoring();
      sendResponse({ success: true });
    });
    return true; // Keep the message channel open for sendResponse
  }
  
  if (message.action === 'getResourceData') {
    // Send the latest cached resource data to the popup
    chrome.storage.local.get(['resourceData'], (result) => {
      sendResponse(result.resourceData || {});
    });
    return true; // Keep the message channel open
  }
  
  if (message.action === 'suspendTab') {
    // Discard (suspend) a single tab
    chrome.tabs.discard(message.tabId).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (message.action === 'suspendAllInactive') {
    // Suspend all inactive tabs
    suspendInactiveTabs().then(count => {
      sendResponse({ suspended: count });
    });
    return true;
  }
});


// background/background.js: collectResourceData function (The final, stable version)

async function collectResourceData() {
    try {
        // 1. Get all tabs
        const tabs = await chrome.tabs.query({});
        
        // 2. Get system memory info (This works! It provides the 846.22 MB value)
        const memoryInfo = await chrome.system.memory.getInfo();
        
        // --- CALCULATE WORKING METRICS ---
        // Calculate system used memory for the "Total Memory Used" card
        const systemUsedMemory = memoryInfo.capacity - memoryInfo.availableCapacity;

        // Initialize/reset data structure
        resourceData = {
            timestamp: Date.now(),
            systemMemory: memoryInfo,
            // Use system-wide used memory for a meaningful metric
            systemUsedMemory: systemUsedMemory, 
            tabs: [],
            // This total will now be zero, but we ignore it on the UI in favor of systemUsedMemory
            totalMemoryUsed: 0 
        };
        
        // 3. Process tabs with 0 memory (Since we can't get process data)
        for (const tab of tabs) {
            // Include ALL tabs in the data structure
            resourceData.tabs.push({
                id: tab.id,
                title: tab.title,
                url: tab.url,
                favicon: tab.favIconUrl,
                memory: 0, // Cannot get this value, so it remains 0
                cpu: 0,    // Cannot get this value, so it remains 0
                active: tab.active,
                discarded: tab.discarded
            });
        }
        
        // --- HISTORY AND STORAGE ---
        // Store system used memory in history, as tab-summed memory is 0
        memoryHistory.push({
            timestamp: Date.now(),
            total: systemUsedMemory, // Track System Used Memory
            tabCount: resourceData.tabs.length
        });
        
        if (memoryHistory.length > MAX_HISTORY) {
            memoryHistory.shift();
        }
        
        resourceData.history = memoryHistory;
        
        // Save to storage for popup access
        await chrome.storage.local.set({ resourceData });
        
        // Update badge (if enabled) - No high memory warning possible without the API
        if (internalSettings.showBadge) {
             chrome.action.setBadgeText({ text: String(tabs.length) }); // Use tab count as the badge value
             chrome.action.setBadgeBackgroundColor({ color: '#526DFF' });
        } else {
             chrome.action.setBadgeText({ text: '' });
        }
        
    } catch (error) {
        // This catch block should now only fire for severe errors, not the getProcessInfo() error
        console.error('Final stable collection error:', error);
        chrome.action.setBadgeText({ text: 'Err' });
    }
}

async function suspendInactiveTabs() {
  // Query for tabs that are NOT active and NOT already discarded
  const tabs = await chrome.tabs.query({ active: false, discarded: false });
  let count = 0;
  
  for (const tab of tabs) {
    // Do not suspend pinned, audible, or system/internal tabs (like chrome:// or about:)
    if (!tab.pinned && !tab.audible && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
      try {
        await chrome.tabs.discard(tab.id);
        count++;
      } catch (error) {
        console.error(`Failed to suspend tab ${tab.id}:`, error);
      }
    }
  }
  
  return count;
}