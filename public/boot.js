// Pre-paint: apply theme mode, font and nothing else before React loads (prevents flashes).
(function () {
  try {
    var mode = localStorage.getItem('mui-mode') || 'system';
    var dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.add(dark ? 'dark' : 'light');
    var font = localStorage.getItem('notes-font');
    var stacks = {
      roboto: '"Roboto", system-ui, sans-serif', inter: '"Inter", system-ui, sans-serif', 'open-sans': '"Open Sans", system-ui, sans-serif',
      lato: '"Lato", system-ui, sans-serif', 'noto-sans': '"Noto Sans", system-ui, sans-serif', 'source-sans-3': '"Source Sans 3", system-ui, sans-serif',
      'roboto-serif': '"Roboto Serif", Georgia, serif', merriweather: '"Merriweather", Georgia, serif', 'roboto-mono': '"Roboto Mono", ui-monospace, monospace',
      system: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    };
    if (font && stacks[font]) document.documentElement.style.setProperty('--app-font', stacks[font]);
  } catch {
    /* storage unavailable: defaults apply */
  }
})();
