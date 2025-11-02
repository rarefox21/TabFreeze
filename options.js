// Default settings
const DEFAULT_SETTINGS = {
  monitoringInterval: 5,
  highMemoryThreshold: 500,
  mediumMemoryThreshold: 100,
  autoSuspendEnabled: false,
  autoSuspendDelay: 30,
  showBadge: true,
  defaultSort: 'memory',
  showChart: true
};

// Load settings when page opens
document.addEventListener('DOMContentLoaded', loadSettings);

// Save button
document.getElementById('saveBtn').addEventListener('click', saveSettings);

// Reset button
document.getElementById('resetBtn').addEventListener('click', resetSettings);

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    const settings = result.settings || DEFAULT_SETTINGS;
    
    // Populate form fields
    document.getElementById('monitoringInterval').value = settings.monitoringInterval;
    document.getElementById('highMemoryThreshold').value = settings.highMemoryThreshold;
    document.getElementById('mediumMemoryThreshold').value = settings.mediumMemoryThreshold;
    document.getElementById('autoSuspendEnabled').checked = settings.autoSuspendEnabled;
    document.getElementById('autoSuspendDelay').value = settings.autoSuspendDelay;
    document.getElementById('showBadge').checked = settings.showBadge;
    document.getElementById('defaultSort').value = settings.defaultSort;
    document.getElementById('showChart').checked = settings.showChart;
    
    console.log('Settings loaded:', settings);
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

// Save settings to storage
async function saveSettings() {
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '💾 Saving...';
  
  try {
    const settings = {
      monitoringInterval: parseInt(document.getElementById('monitoringInterval').value),
      highMemoryThreshold: parseInt(document.getElementById('highMemoryThreshold').value),
      mediumMemoryThreshold: parseInt(document.getElementById('mediumMemoryThreshold').value),
      autoSuspendEnabled: document.getElementById('autoSuspendEnabled').checked,
      autoSuspendDelay: parseInt(document.getElementById('autoSuspendDelay').value),
      showBadge: document.getElementById('showBadge').checked,
      defaultSort: document.getElementById('defaultSort').value,
      showChart: document.getElementById('showChart').checked
    };
    
    // Validate settings
    if (settings.monitoringInterval < 1 || settings.monitoringInterval > 60) {
      throw new Error('Monitoring interval must be between 1-60 seconds');
    }
    
    if (settings.mediumMemoryThreshold >= settings.highMemoryThreshold) {
      throw new Error('Medium memory threshold must be less than high memory threshold');
    }
    
    // Save to storage
    await chrome.storage.sync.set({ settings });
    
    // Notify background script to update settings
    chrome.runtime.sendMessage({ action: 'updateSettings', settings });
    
    showStatus('✅ Settings saved successfully!', 'success');
    console.log('Settings saved:', settings);
    
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('❌ Error: ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Save Settings';
  }
}

// Reset to default settings
async function resetSettings() {
  if (!confirm('Reset all settings to defaults? This cannot be undone.')) {
    return;
  }
  
  const btn = document.getElementById('resetBtn');
  btn.disabled = true;
  btn.textContent = '🔄 Resetting...';
  
  try {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    await loadSettings();
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'updateSettings', settings: DEFAULT_SETTINGS });
    
    showStatus('✅ Settings reset to defaults', 'success');
  } catch (error) {
    console.error('Error resetting settings:', error);
    showStatus('❌ Error resetting settings', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Reset to Defaults';
  }
}

// Show status message
function showStatus(message, type) {
  const statusDiv = document.getElementById('statusMessage');
  statusDiv.textContent = message;
  statusDiv.style.background = type === 'success' ? '#d4edda' : '#f8d7da';
  statusDiv.style.color = type === 'success' ? '#155724' : '#721c24';
  statusDiv.classList.add('show');
  
  setTimeout(() => {
    statusDiv.classList.remove('show');
  }, 3000);
}