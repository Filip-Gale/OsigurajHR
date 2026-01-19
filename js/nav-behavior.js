function initNavBehavior() {
    // Give the include some time to finish loading
    setTimeout(() => {
        const path = window.location.pathname;
        const repoBase = location.pathname.split('/')[1] || '';  

        console.log(path);
        console.log(repoBase);

      const isIndex =
        path === '/' ||
        path === '' ||
        path === `/${repoBase}/` ||
        path === `/${repoBase}` ||
        path.endsWith('index.html') ||
        path.endsWith('/index.html') ||
        path.endsWith('/index') ||
        path === `/${repoBase}/index.html` ||
        path.endsWith(`/${repoBase}/index.html`);

        if (!isIndex) return;

        const mainNav = document.getElementById('main-nav');
        const miniButton = document.getElementById('scrollTopButton');

        if (!mainNav || !miniButton) return;

        const THRESHOLD = 650;

        function updateNav() {
            const shouldShowMini = window.scrollY > THRESHOLD;
            
            mainNav.classList.toggle('nav-hidden', shouldShowMini);
            miniButton.classList.toggle('show', shouldShowMini);
            
            mainNav.classList.toggle('show', !shouldShowMini);
            miniButton.classList.toggle('nav-hidden', !shouldShowMini);
        }

        window.addEventListener('scroll', updateNav, { passive: true });
        updateNav();
    }, 400);
}

// Auto-init when script is loaded
initNavBehavior();

// Also allow manual call if needed
window.initNavBehavior = initNavBehavior;