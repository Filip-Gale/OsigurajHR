class NavInclude extends HTMLElement {
  async connectedCallback() {
    const src = this.getAttribute('src');
    if (!src) return;

    try {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`Failed to load ${src}: ${response.status}`);
      }
      const html = await response.text();
      this.innerHTML = html;
    } catch (error) {
      console.error('Navigation loading error:', error);
      this.innerHTML = '<p style="color: red;">Navigation failed to load</p>';
    }
  }
}

customElements.define('content-include', NavInclude);