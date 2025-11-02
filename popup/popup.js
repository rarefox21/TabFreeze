let currentData = null;
let sortBy = 'memory';
let memoryChart = null;

// NOTE: Assumes utility functions (formatBytes, timeAgo, etc.) are available either locally 
// or via the ../utils/formatters.js script inclusion.

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadResourceData();
    setupEventListeners();
    
    // Auto-refresh every 10 seconds
    setInterval(loadResourceData, 10000);
});

function setupEventListeners() {
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadResourceData(true); // Pass 'true' to indicate a manual refresh
    });
    
    // Suspend all button
    document.getElementById('suspendAllBtn').addEventListener('click', async () => {
        const btn = document.getElementById('suspendAllBtn');
        btn.disabled = true;
        btn.textContent = '⏳ Suspending...';
        
        try {
            const response = await chrome.runtime.sendMessage({ 
                action: 'suspendAllInactive' 
            });
            
            // This is the correct UX for Suspend Inactive
            btn.textContent = `✅ Suspended ${response.suspended || 0} tabs`;
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = '💤 Suspend Inactive';
                loadResourceData(); // Reload data to update list status
            }, 2000);
        } catch (error) {
            console.error('Suspension failed:', error);
            btn.textContent = '❌ Suspend Failed';
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = '💤 Suspend Inactive';
            }, 2000);
        }
    });
    
    // Sort options
    document.querySelectorAll('input[name="sort"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            sortBy = e.target.value;
            if (currentData) renderTabList(currentData);
        });
    });
}

async function loadResourceData(isManual = false) {
    const refreshBtn = document.getElementById('refreshBtn');
    
    if (isManual) {
        // FIX: Immediate visual feedback for manual refresh
        refreshBtn.disabled = true;
        refreshBtn.textContent = '⏳ Loading...';
        document.querySelector('.last-update').textContent = 'Loading...';
    }

    try {
        const data = await chrome.runtime.sendMessage({ 
            action: 'getResourceData' 
        });
        
        if (data && data.tabs) {
            currentData = data;
            updateUI(data);
        } else {
            document.getElementById('tabListContainer').innerHTML = '<div class="error-state">No data received. Try reloading extension.</div>';
        }
    } catch (error) {
        console.error('Error loading resource data. Is the background worker active?', error);
        document.getElementById('tabListContainer').innerHTML = '<div class="error-state">Error fetching data. Check service worker console.</div>';
    } finally {
        // Revert button state after load (only if it was manually triggered)
        if (isManual) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '🔄 Refresh';
        }
    }
}

function updateUI(data) {
    if (typeof formatBytes === 'undefined' || typeof timeAgo === 'undefined') {
        console.error("Formatter utility functions are missing!");
        return;
    }

    // Update timestamp
    document.querySelector('.last-update').textContent = 
      `Updated ${timeAgo(data.timestamp)}`;
    
    // Update system stats
    document.getElementById('totalMemory').textContent = 
      formatBytes(data.systemUsedMemory || 0); 
    
    if (data.systemMemory) {
      const available = data.systemMemory.availableCapacity;
      document.getElementById('systemAvailable').textContent = 
        formatBytes(available);
    }
    
    document.getElementById('activeTabs').textContent = 
      data.tabs.length;
    
    // Render tab list
    renderTabList(data);

    // CRITICAL FIX: Hide chart section if Chart.js is not loaded (fixes popup size)
    const chartSection = document.querySelector('.chart-section');

    if (typeof Chart !== 'undefined' && data.history) {
        updateChart(data.history);
        chartSection.style.display = 'block'; 
    } else {
        console.warn("Chart.js is not loaded or data is missing. Hiding chart area to fix UI height.");
        chartSection.style.display = 'none'; 
    }
}

function renderTabList(data) {
    const container = document.getElementById('tabListContainer');
    const warningDiv = document.getElementById('tab-sort-warning');
    
    if (!data.tabs || data.tabs.length === 0) {
        container.innerHTML = '<div class="empty-state">No tabs found</div>';
        warningDiv.textContent = "";
        return;
    }
    
    // Check if per-tab memory is 0 for everyone (API is blocked/broken)
    const allMemoryZero = data.tabs.every(t => t.memory === 0);
    
    // This warning clarifies why sorting doesn't appear to work.
    if (allMemoryZero) {
        // warningDiv.textContent = "⚠️ Tab memory/CPU data unavailable. Suspend feature is fully functional.";
    } else {
        warningDiv.textContent = "";
    }
    
    // Sort tabs 
    const sortedTabs = [...data.tabs].sort((a, b) => {
        if (sortBy === 'memory') {
            return b.memory - a.memory;
        } else {
            return b.cpu - a.cpu;
        }
    });
    
    // Render
    container.innerHTML = sortedTabs.map(tab => createTabItem(tab)).join('');
    
    // Add event listeners for both suspend and restore-prompt buttons
    container.querySelectorAll('.tab-btn, .tab-btn-restore-prompt').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = parseInt(e.target.dataset.tabId);
            suspendTab(tabId, e.target);
        });
    });
}

function createTabItem(tab) {
    const memoryClass = getMemoryClass(tab.memory); 
    const favicon = tab.favicon || '../icons/icon16.png'; 
    const title = tab.title || 'Untitled';
    const url = tab.url ? new URL(tab.url).hostname : 'chrome-internal';
    
    // FIX: Change button text for discarded tabs to prompt manual refresh
    const buttonText = tab.discarded ? 'Refresh to Restore' : 'Suspend';
    // Use the specific class for the manual prompt
    const actionClass = tab.discarded ? 'tab-btn-restore-prompt' : 'tab-btn'; 
    
    const memoryDisplay = formatBytes(tab.memory);
    const cpuDisplay = formatCPU(tab.cpu);
    
    return `
        <div class="tab-item ${memoryClass} ${tab.discarded ? 'discarded' : ''}">
            <img src="${favicon}" class="tab-favicon" onerror="this.src='../icons/icon16.png'">
            <div class="tab-info">
                <div class="tab-title">${escapeHtml(title)}</div>
                <div class="tab-url">${escapeHtml(url)}</div>
            </div>
            
            <div class="tab-actions">
                <button class="${actionClass}" data-tab-id="${tab.id}">${buttonText}</button>
            </div>
        </div>
    `;
    // <div class="tab-stats">
    //             <div class="tab-memory" style="color: ${getMemoryColor(tab.memory)}">
    //                 ${memoryDisplay}
    //             </div>
    //             <div class="tab-cpu">CPU: ${cpuDisplay}</div>
    //         </div>
}

async function suspendTab(tabId, button) {
    const isRestorePrompt = button.classList.contains('tab-btn-restore-prompt');
    const originalText = button.textContent;
    const originalClass = button.className;

    button.disabled = true;
    button.textContent = '⏳';
    
    try {
        // We still send the suspendTab action, which in the background script
        // should handle focusing/activating the tab if it's discarded.
        const response = await chrome.runtime.sendMessage({ 
            action: 'suspendTab',
            tabId: tabId
        });
        
        if (response.success) {
            if (isRestorePrompt) {
                // FIX: If it was a 'Refresh to Restore' click (i.e., a discarded tab)
                
                // Prompt the user for manual refresh
                button.textContent = 'Use Ctrl+R/F5'; 
                
                // After the prompt, revert the button to a 'Suspend' state (for the newly loaded tab)
                setTimeout(() => {
                    button.disabled = false;
                    button.textContent = 'Suspend';
                    button.className = 'tab-btn'; // Revert class
                    // We don't need loadResourceData() here, as the manual refresh will change the state.
                }, 3000); 
                
            } else {
                // Success: Wait briefly for Chrome to update the tab's state, then refresh data
                setTimeout(() => {
                    loadResourceData();
                }, 500);
            }
        } else {
            throw new Error(response.error || 'Unknown suspension error');
        }

    } catch (error) {
        console.error('Error suspending/restoring tab:', error);
        
        // Error handler: revert the button to the state it *should* have been
        button.textContent = 'Error';
        setTimeout(() => {
            button.disabled = false;
            // Revert to original state (either 'Suspend' or 'Refresh to Restore')
            button.textContent = originalText;
            button.className = originalClass; 
        }, 2000);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// NOTE: Placeholder utility functions. These should be in ../utils/formatters.js
function getMemoryClass(bytes) {
    const mb = bytes / (1024 * 1024);
    if (mb > 300) return 'high-memory';
    if (mb > 100) return 'medium-memory';
    return 'low-memory';
}
function getMemoryColor(bytes) {
    const mb = bytes / (1024 * 1024);
    if (mb > 300) return '#FF0000';
    if (mb > 100) return '#FFA500';
    return '#3CB371';
}
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
function formatCPU(cpu) {
    return cpu.toFixed(1) + '%';
}
function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
}

// Charting logic - relies on Chart.js being loaded
function updateChart(history) {
    const ctx = document.getElementById('memoryChart').getContext('2d');
    
    const labels = history.map(h => {
      const date = new Date(h.timestamp);
      return date.toLocaleTimeString();
    });
    
    const memoryData = history.map(h => h.total / (1024 * 1024)); // Convert System Used Memory (bytes) to MB
    
    if (memoryChart) {
      memoryChart.data.labels = labels;
      memoryChart.data.datasets[0].data = memoryData;
      memoryChart.update();
    } else {
      memoryChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'System Used Memory (MB)',
            data: memoryData,
            borderColor: '#667eea',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return value.toFixed(0) + ' MB';
                }
              }
            }
          }
        }
      });
    }
}