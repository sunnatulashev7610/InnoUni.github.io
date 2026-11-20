/* Gather Edu motion. Progressive: without JS or with reduced motion the page is simply static.
   - blur-to-focus on sections ([data-reveal] is added here, no HTML edits)
   - logo intro once per visit (landing only)
   - a lime light stream that is drawn as you scroll (landing, wide screens, dark theme)
   - mouse tilt on the hero preview (fine pointers only) */
(function () {
	'use strict';
	var root = document.documentElement;
	var calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (calm) return;
	root.classList.add('m-on');

	// ---- blur-to-focus
	function reveal() {
		var targets = [];
		function add(list) { Array.prototype.forEach.call(list, function (n, i) { n.setAttribute('data-reveal', ''); n.style.setProperty('--i', String(i)); targets.push(n); }); }
		add(document.querySelectorAll('.ge-hero-grid > *'));
		add(document.querySelectorAll('.ge-stats, main > section.ge-section, main > section.ge-wrap'));
		add(document.querySelectorAll('.login-container, .register-container'));
		if (!('IntersectionObserver' in window)) { targets.forEach(function (n) { n.classList.add('in'); }); return; }
		var io = new IntersectionObserver(function (es) {
			es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
		}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
		targets.forEach(function (n) { io.observe(n); });
		// never leave content hidden if something goes wrong
		setTimeout(function () { targets.forEach(function (n) { n.classList.add('in'); }); }, 6000);
	}

	// ---- logo intro: ring draws, becomes the logo, settles into the header
	function intro() {
		var mark = document.querySelector('.ge-logo-mark');
		var seen = false;
		try { seen = sessionStorage.getItem('geIntro') === '1'; sessionStorage.setItem('geIntro', '1'); } catch (e) { /* ignore */ }
		if (!mark || seen) return;
		var NS = 'http://www.w3.org/2000/svg';
		var ov = document.createElement('div'); ov.className = 'm-intro'; ov.setAttribute('aria-hidden', 'true');
		var box = document.createElement('div'); box.className = 'm-intro-box';
		var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 120 120');
		['track', 'ring'].forEach(function (c) {
			var k = document.createElementNS(NS, 'circle'); k.setAttribute('class', c); k.setAttribute('cx', '60'); k.setAttribute('cy', '60'); k.setAttribute('r', '56'); k.setAttribute('pathLength', '1'); svg.appendChild(k);
		});
		var img = document.createElement('img'); img.src = mark.getAttribute('src'); img.alt = '';
		box.appendChild(svg); box.appendChild(img); ov.appendChild(box); document.body.appendChild(ov);
		mark.classList.add('m-hide-mark');
		var done = false;
		function finish() { if (done) return; done = true; ov.remove(); mark.classList.remove('m-hide-mark'); }
		setTimeout(finish, 4500);
		var ring = svg.querySelector('.ring');
		var draw = ring.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1100, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
		draw.onfinish = function () {
			img.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
			svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, delay: 120, fill: 'forwards' });
			setTimeout(function () {
				// settle: fly the logo to its place in the header
				var a = img.getBoundingClientRect(); var b = mark.getBoundingClientRect();
				var dx = b.left + b.width / 2 - (a.left + a.width / 2); var dy = b.top + b.height / 2 - (a.top + a.height / 2);
				var sc = b.width / a.width;
				ov.style.background = 'transparent';
				var fly = img.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')' }], { duration: 650, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
				fly.onfinish = finish;
			}, 650);
		};
	}

	// ---- light stream
	function stream() {
		var secs = document.querySelectorAll('main > section');
		if (secs.length < 3 || matchMedia('(max-width: 900px)').matches) return;
		var NS = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'm-stream'); svg.setAttribute('aria-hidden', 'true');
		var track = document.createElementNS(NS, 'path'); track.setAttribute('class', 'm-track');
		var lit = document.createElementNS(NS, 'path'); lit.setAttribute('class', 'm-lit');
		[track, lit].forEach(function (p) { p.setAttribute('pathLength', '1'); svg.appendChild(p); });
		lit.style.strokeDasharray = '1'; lit.style.strokeDashoffset = '1';
		document.body.style.position = 'relative'; document.body.appendChild(svg);
		var H = 1; var top1 = 0;
		function layout() {
			var W = document.documentElement.clientWidth; H = document.documentElement.scrollHeight;
			svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.style.height = H + 'px';
			// the stream starts below the hero so it never crosses the headline
			var top0 = secs[1].getBoundingClientRect().top + scrollY; top1 = top0;
			var d = 'M ' + (W * .5) + ' ' + top0;
			var x = W * .06; var side = 0;
			var px = W * .5, py = top0;
			Array.prototype.forEach.call(secs, function (s, i) {
				if (i < 2) return;
				var y = s.getBoundingClientRect().top + scrollY;
				x = side ? W * .94 : W * .06; side = 1 - side;
				d += ' C ' + px + ' ' + (py + (y - py) * .55) + ', ' + x + ' ' + (py + (y - py) * .45) + ', ' + x + ' ' + (py + (y - py) * .5);
				d += ' S ' + x + ' ' + (y - 40) + ', ' + (W * .5) + ' ' + y;
				px = W * .5; py = y;
			});
			d += ' L ' + (W * .5) + ' ' + H;
			track.setAttribute('d', d); lit.setAttribute('d', d);
			paint();
		}
		function paint() {
			var p = Math.min(1, Math.max(0, (scrollY + innerHeight * .6 - top1) / Math.max(1, H - top1)));
			lit.style.strokeDashoffset = String(1 - p);
		}
		var raf = 0;
		addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; paint(); }); }, { passive: true });
		addEventListener('resize', function () { clearTimeout(layout.t); layout.t = setTimeout(layout, 150); });
		addEventListener('load', layout);
		layout();
	}

	// ---- tilt
	function tilt() {
		var mock = document.querySelector('.ge-mock');
		if (!mock || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
		var t = mock.querySelector('.m-main'); if (!t) return;
		mock.style.perspective = '1000px'; t.classList.add('m-tilt');
		mock.addEventListener('pointermove', function (e) {
			var r = mock.getBoundingClientRect();
			var x = (e.clientX - r.left) / r.width - .5; var y = (e.clientY - r.top) / r.height - .5;
			t.style.transform = 'rotateY(' + (x * 8).toFixed(2) + 'deg) rotateX(' + (-y * 8).toFixed(2) + 'deg)';
		});
		mock.addEventListener('pointerleave', function () { t.style.transform = ''; });
	}

	reveal(); intro(); stream(); tilt();
})();
