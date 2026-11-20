const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../frontend/js/theme.js'), 'utf8');
const head = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8').match(/<script>(\(function\(\)\{var d=document[^\n]*?)<\/script>/)[1];

function boot({ saved, systemDark = false } = {}) {
    const dom = new JSDOM('<!doctype html><html><body><button data-theme-toggle><i class="ico-sun"></i><i class="ico-moon"></i></button><div class="pg-seg"><button data-theme-set="dark"></button><button data-theme-set="light"></button><button data-theme-set="system"></button></div></body></html>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window;
    let listener = null;
    w.matchMedia = () => ({ matches: systemDark, addEventListener: (e, f) => { listener = f; } });
    if (saved) w.localStorage.setItem('geTheme', saved);
    w.eval(head);
    return { w, root: w.document.documentElement, flip: (dark) => { systemDark = dark; w.matchMedia = () => ({ matches: dark }); listener && (w.__dark = dark); }, listener: () => listener, setSystem: (v) => { systemDark = v; } };
}
const run = (w) => w.eval(src);

test('first visit defaults to dark, set before the page paints', () => {
    const { w, root } = boot();
    expect(root.dataset.theme).toBe('dark'); expect(root.dataset.themePref).toBe('dark');
    run(w); expect(root.dataset.theme).toBe('dark');
});

test('a saved light choice is applied by the inline head script', () => {
    const { root } = boot({ saved: 'light' });
    expect(root.dataset.theme).toBe('light'); expect(root.dataset.themePref).toBe('light');
});

test('an unknown saved value falls back to dark', () => {
    const { root } = boot({ saved: 'purple' });
    expect(root.dataset.themePref).toBe('dark');
});

test('system follows the device', () => {
    const a = boot({ saved: 'system', systemDark: true }); expect(a.root.dataset.theme).toBe('dark');
    const b = boot({ saved: 'system', systemDark: false }); expect(b.root.dataset.theme).toBe('light'); expect(b.root.dataset.themePref).toBe('system');
});

test('the toggle cycles dark, light, system and saves each choice', () => {
    const { w, root } = boot(); run(w);
    const t = w.document.querySelector('[data-theme-toggle]');
    t.click(); expect(root.dataset.themePref).toBe('light'); expect(root.dataset.theme).toBe('light'); expect(w.localStorage.getItem('geTheme')).toBe('light');
    t.click(); expect(root.dataset.themePref).toBe('system'); expect(w.localStorage.getItem('geTheme')).toBe('system');
    t.click(); expect(root.dataset.themePref).toBe('dark');
    expect(t.querySelector('.ico-auto')).not.toBeNull();
    expect(t.getAttribute('aria-label')).toContain('Qorong');
});

test('the settings buttons pick a mode and show which one is on', () => {
    const { w, root } = boot({ saved: 'light' }); run(w);
    const [d, l, s] = w.document.querySelectorAll('[data-theme-set]');
    expect(l.classList.contains('on')).toBe(true); expect(l.getAttribute('aria-pressed')).toBe('true');
    s.click(); expect(root.dataset.themePref).toBe('system'); expect(s.classList.contains('on')).toBe(true); expect(l.classList.contains('on')).toBe(false);
    d.click(); expect(root.dataset.theme).toBe('dark');
});

test('while System is selected the device change is followed live', () => {
    const { w, root } = boot({ saved: 'system', systemDark: false });
    const mq = { matches: true, addEventListener: (e, f) => { mq.fire = f; } };
    w.matchMedia = () => mq;
    run(w);
    expect(root.dataset.theme).toBe('dark');
    mq.matches = false; mq.fire();
    expect(root.dataset.theme).toBe('light');
    // a fixed choice ignores the device
    w.document.querySelector('[data-theme-set="dark"]').click();
    mq.matches = false; mq.fire();
    expect(root.dataset.theme).toBe('dark');
});

test('every page ships the no-flash inline script', () => {
    const root = path.join(__dirname, '../..');
    const pages = ['index.html', 'legal/terms.html', 'secondary-pages/login/login.html', 'secondary-pages/dashboard/dashboard.html', 'secondary-pages/admin/admin.html'];
    pages.forEach((p) => expect(fs.readFileSync(path.join(root, p), 'utf8')).toContain("d.dataset.themePref=p"));
});
