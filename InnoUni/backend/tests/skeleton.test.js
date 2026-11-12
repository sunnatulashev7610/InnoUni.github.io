const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const dataSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-data.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style/dashboard-pages.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'secondary-pages/dashboard/dashboard.html'), 'utf8');

function boot() {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    dom.window.eval(dataSrc);
    return dom.window;
}

describe('skeleton placeholder', () => {
    test('is a labelled busy status with placeholder blocks and no external text', () => {
        const w = boot();
        const sk = w.GEData.skeleton();
        expect(sk.getAttribute('role')).toBe('status');
        expect(sk.getAttribute('aria-busy')).toBe('true');
        expect(sk.querySelector('.sk-sr').textContent).toBe('Yuklanmoqda...');
        expect(sk.querySelectorAll('.sk').length).toBeGreaterThan(10);
        expect(sk.querySelectorAll('.sk-card')).toHaveLength(4);
    });

    test('has() tells which pages load real data', () => {
        const w = boot();
        w.GEData.register('demo-page', async () => {});
        expect(w.GEData.has('demo-page')).toBe(true);
        expect(w.GEData.has('nope')).toBe(false);
    });
});

describe('skeleton styles and wiring', () => {
    test('uses theme tokens and respects reduced motion', () => {
        expect(css).toMatch(/\.sk::after[^}]*animation:\s*sk-sweep/);
        expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.sk::after\s*\{\s*animation:\s*none/);
        const block = css.slice(css.indexOf('Skeleton loading'));
        expect(block).not.toMatch(/#[0-9a-f]{3,6}\b/i); // no hard-coded hex colours
    });

    test('the dashboard shows the skeleton and drops the spinner', () => {
        expect(html).toContain('showSkeleton(contentArea)');
        expect(html).not.toContain('<div class="spinner"></div>');
    });
});
