// Configuration for the particle background with light theme
window.onload = function() {
  // Initialize particles background with light theme colors
  Particles.init({
    selector: '.particle-container',
    color: ['#6366f1', '#818cf8', '#a5b4fc'], // Purple accent colors
    connectParticles: true,
    maxParticles: 80,
    sizeVariations: 2,
    speed: 0.6,
    opacity: 0.3, // More subtle for light theme
    responsive: [
      {
        breakpoint: 1024,
        options: {
          maxParticles: 60
        }
      },
      {
        breakpoint: 768,
        options: {
          maxParticles: 40
        }
      },
      {
        breakpoint: 480,
        options: {
          maxParticles: 20
        }
      }
    ]
  });
  
  // Handle generate button click events
  const generateBtn = document.getElementById('generate-btn');
  const appContainer = document.getElementById('generated-app-container');
  const placeholderContent = document.querySelector('.placeholder-content');
  const statusIndicator = document.querySelector('.status');
  
  // Set up suggestion chips
  const suggestionChips = document.querySelectorAll('.suggestion-chip');
  const promptInput = document.getElementById('prompt-input');
  
  suggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      promptInput.value = chip.textContent;
      generateApp();
    });
  });
  
  // Function to simulate app generation (will be replaced with actual generation)
  function generateApp() {
    if (!promptInput.value.trim()) {
      showNotification('Please enter a prompt');
      return;
    }
    
    appContainer.classList.add('generating');
    placeholderContent.classList.add('loading');
    statusIndicator.textContent = "Generating...";
    
    // Simulate app generation process (replace with actual API call)
    setTimeout(() => {
      appContainer.classList.remove('generating');
      placeholderContent.classList.remove('loading');
      statusIndicator.textContent = "Ready";
      showNotification('App generated successfully');
    }, 3000);
  }
  
  // Event handlers
  generateBtn.addEventListener('click', generateApp);
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      generateApp();
    }
  });
  
  // Function to show notifications
  function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    // Add to body
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 500);
    }, 3000);
  }
  
  // Set up window controls (if in Electron environment)
  const minimizeBtn = document.querySelector('.minimize');
  const maximizeBtn = document.querySelector('.maximize');
  const closeBtn = document.querySelector('.close');
  
  if (minimizeBtn && typeof window.electronAPI !== 'undefined') {
    minimizeBtn.addEventListener('click', () => {
      window.electronAPI.minimizeWindow();
    });
    
    maximizeBtn.addEventListener('click', () => {
      window.electronAPI.maximizeWindow();
    });
    
    closeBtn.addEventListener('click', () => {
      window.electronAPI.closeWindow();
    });
  }
};