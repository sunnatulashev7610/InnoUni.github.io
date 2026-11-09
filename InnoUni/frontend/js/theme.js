/* Theme switch: light / dark. The saved choice wins; otherwise follow the system. */
(function () {
	var root = document.documentElement;
	function saved() { try { return localStorage.getItem('geTheme'); } catch (e) { return null; } }
	function set(t) {
		root.dataset.theme = t;
		try { localStorage.setItem('geTheme', t); } catch (e) { /* private mode */ }
		document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
			b.setAttribute('aria-pressed', String(t === 'dark'));
			b.setAttribute('aria-label', t === 'dark' ? 'Yorug\' rejimga o\'tish' : 'Tungi rejimga o\'tish');
		});
	}
	set(root.dataset.theme || saved() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
	document.addEventListener('click', function (e) {
		if (e.target.closest('[data-theme-toggle]')) set(root.dataset.theme === 'dark' ? 'light' : 'dark');
	});
})();
