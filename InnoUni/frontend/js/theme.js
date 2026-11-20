/* Theme: Dark, Light or System. The choice is saved ('geTheme'); the default is Dark.
   The inline script in each page's <head> sets data-theme-pref / data-theme before first paint (no flash);
   this file wires the buttons and follows the system setting while "System" is selected. */
(function () {
	var root = document.documentElement;
	var MODES = ['dark', 'light', 'system'];
	var NAMES = { dark: 'Qorong\'i', light: 'Yorug\'', system: 'Tizim' };
	var mq = matchMedia('(prefers-color-scheme: dark)');
	function saved() { try { var v = localStorage.getItem('geTheme'); return MODES.indexOf(v) > -1 ? v : 'dark'; } catch (e) { return 'dark'; } }
	function effective(pref) { return pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref; }

	function paint() {
		var pref = root.dataset.themePref || 'dark';
		document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
			if (!b.querySelector('.ico-auto')) { var i = document.createElement('i'); i.className = 'fas fa-circle-half-stroke ico-auto'; b.appendChild(i); }
			var next = MODES[(MODES.indexOf(pref) + 1) % MODES.length];
			b.setAttribute('aria-label', 'Mavzu: ' + NAMES[pref] + '. ' + NAMES[next] + ' ga o\'tish');
			b.setAttribute('title', 'Mavzu: ' + NAMES[pref]);
			b.removeAttribute('aria-pressed');
		});
		document.querySelectorAll('[data-theme-set]').forEach(function (b) {
			var on = b.dataset.themeSet === pref;
			b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
		});
	}
	function set(pref) {
		if (MODES.indexOf(pref) < 0) pref = 'dark';
		root.dataset.themePref = pref; root.dataset.theme = effective(pref);
		try { localStorage.setItem('geTheme', pref); } catch (e) { /* private mode */ }
		paint();
		document.dispatchEvent(new CustomEvent('ge-theme', { detail: { pref: pref, theme: root.dataset.theme } }));
	}

	root.dataset.themePref = root.dataset.themePref || saved();
	root.dataset.theme = effective(root.dataset.themePref);
	paint();

	document.addEventListener('click', function (e) {
		var pick = e.target.closest('[data-theme-set]');
		if (pick) { set(pick.dataset.themeSet); return; }
		if (e.target.closest('[data-theme-toggle]')) set(MODES[(MODES.indexOf(root.dataset.themePref) + 1) % MODES.length]);
	});
	// "System": follow the device live
	(mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () {
		if (root.dataset.themePref === 'system') { root.dataset.theme = effective('system'); paint(); }
	});
	// pages that are loaded into the dashboard later (settings) get their buttons in sync
	if ('MutationObserver' in window) new MutationObserver(function () { if (document.querySelector('[data-theme-set]:not([aria-pressed])')) paint(); }).observe(document.body || root, { childList: true, subtree: true });
})();
