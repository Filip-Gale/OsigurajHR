// Very simple version - remove loader when page is interactive
console.log("aaaa");

window.addEventListener('load', () => {
  document.getElementById('page-loader').classList.add('nav-hidden');
  
  // Optional: completely remove from DOM after transition
  setTimeout(() => {
    document.getElementById('page-loader')?.remove();
  }, 100);
}, {once: true});
