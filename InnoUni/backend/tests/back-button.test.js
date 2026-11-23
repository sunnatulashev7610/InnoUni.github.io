// Back button: signing in must not leave the login page in the history, and the dashboards track their pages.
const fs = require('fs');
const path = require('path');
const site = path.join(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(site, f), 'utf8');

test('after signing in the login page is replaced, not kept in history', () => {
    ['secondary-pages/login/login.html', 'secondary-pages/login/register.html'].forEach((f) => {
        const src = read(f);
        expect(src).toMatch(/location\.replace\(siteUrl\(/);
        expect(src).not.toMatch(/location\.href = siteUrl\(/);
    });
    expect(read('secondary-pages/admin/admin-login.html')).toMatch(/location\.replace\('admin\.html'\)/);
});

test('redirects to the login page replace the current entry (no Back loop)', () => {
    const dir = path.join(site, 'frontend/js');
    fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
        expect(read('frontend/js/' + f)).not.toMatch(/location\.href = '\.\.\/login\/login\.html'/);
    });
});

test.each(['secondary-pages/dashboard/dashboard.html', 'secondary-pages/admin/admin.html'])('%s records pages in history and handles Back', (f) => {
    const src = read(f);
    expect(src).toMatch(/history\.pushState/);
    expect(src).toMatch(/history\.replaceState/);
    expect(src).toMatch(/addEventListener\('popstate'/);
});
