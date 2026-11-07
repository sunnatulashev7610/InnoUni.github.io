// Every local stylesheet/script/image an HTML page asks for must exist, and the server must serve it.
// Also guards against exposing backend source code or .env through the static mounts.
process.env.JWT_SECRET = 'test-secret-test-secret-123';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');

const SITE = path.join(__dirname, '../..');

function htmlFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'backend'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) htmlFiles(full, out);
        else if (entry.name.endsWith('.html')) out.push(full);
    }
    return out;
}

// Files in secondary-pages/dashboard/pages/ are injected into secondary-pages/dashboard/dashboard.html,
// so their relative links resolve against that page, not against their own location.
const baseDirOf = (file) =>
    file.includes(`${path.sep}dashboard${path.sep}pages${path.sep}`) ? path.join(SITE, 'secondary-pages/dashboard') : path.dirname(file);

function localAssets(file) {
    const src = fs.readFileSync(file, 'utf8');
    const found = [];
    const re = /<(?:link|script|img|source)\b[^>]*?\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(src))) {
        const url = m[1];
        if (/^(https?:)?\/\/|^data:|^#|^mailto:|^javascript:/i.test(url) || url.includes('${')) continue;
        if (/\.(css|js|png|jpe?g|webp|svg|gif)(\?|#|$)/i.test(url)) found.push(url);
    }
    return found;
}

describe('assets referenced by the HTML pages', () => {
    const pages = htmlFiles(SITE);

    test('there are pages to check', () => {
        expect(pages.length).toBeGreaterThan(5);
    });

    test.each(pages.map((p) => [path.relative(SITE, p), p]))('%s: no root-absolute asset paths', (_name, file) => {
        // "/css/x.css" breaks on GitHub Pages project sites and on any non-root hosting
        expect(localAssets(file).filter((u) => u.startsWith('/'))).toEqual([]);
    });

    test.each(pages.map((p) => [path.relative(SITE, p), p]))('%s: every asset file exists', (_name, file) => {
        const missing = localAssets(file)
            .filter((u) => !u.startsWith('/'))
            .filter((u) => !fs.existsSync(path.join(baseDirOf(file), decodeURIComponent(u.split(/[?#]/)[0]))));
        expect(missing).toEqual([]);
    });
});

describe('url() inside project stylesheets', () => {
    test('style/style.css background images exist and are not root-absolute', () => {
        const cssFile = path.join(SITE, 'style/style.css');
        const css = fs.readFileSync(cssFile, 'utf8');
        const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]).filter((u) => !/^(data:|https?:)/.test(u));
        expect(urls.length).toBeGreaterThan(0);
        for (const u of urls) {
            expect(u.startsWith('/')).toBe(false);
            expect(fs.existsSync(path.resolve(path.dirname(cssFile), u))).toBe(true);
        }
    });

    test('no stylesheet file name contains a space', () => {
        const bad = [];
        const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
            if (['node_modules', '.git'].includes(e.name)) return;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (/\s\.css$/i.test(e.name)) bad.push(path.relative(SITE, full));
        });
        walk(SITE);
        expect(bad).toEqual([]);
    });
});

describe('the server serves the site', () => {
    test.each([
        ['/css/bootstrap.min.css', /text\/css/],
        ['/style/style.css', /text\/css/],
        ['/imgs/hero.bg.png', /image\/png/],
        ['/secondary-pages/login/login.html', /text\/html/],
        ['/frontend/js/utils.js', /javascript/],
        ['/js/utils.js', /javascript/],   // dashboards request /js/... through the /dashboard/:id route
        ['/', /text\/html/]
    ])('GET %s', async (url, type) => {
        const res = await request(app).get(url);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(type);
    });

    test('the home page is the real index.html', async () => {
        const res = await request(app).get('/');
        expect(res.text).toContain('style/style.css');
    });

    test.each(['/backend/server.js', '/backend/.env', '/backend/.env.example', '/backend/package.json', '/.git/config'])(
        'does not expose %s', async (url) => {
            const res = await request(app).get(url);
            expect(res.text).not.toMatch(/JWT_SECRET|require\(|\[core\]/);
        });
});
