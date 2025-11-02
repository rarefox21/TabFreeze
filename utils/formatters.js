// utils/formatters.js

// Format bytes to human-readable format
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Format CPU percentage
function formatCPU(cpu) {
  return cpu ? `${cpu.toFixed(1)}%` : '0%';
}

// Get memory usage color
function getMemoryColor(bytes) {
  const mb = bytes / (1024 * 1024);
  
  // Using hardcoded values for popup display consistency
  if (mb < 100) return '#4CAF50'; // Green (Low)
  if (mb < 300) return '#FF9800'; // Orange (Medium)
  return '#F44336'; // Red (High)
}

// Get time ago
function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}