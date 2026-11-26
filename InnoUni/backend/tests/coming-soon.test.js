const fs = require('fs');
const path = require('path');
const pages = path.join(__dirname, '../../secondary-pages/dashboard/pages');
const read = (f) => fs.readFileSync(path.join(pages, f), 'utf8');
const dash = fs.readFileSync(path.join(__dirname, '../../secondary-pages/dashboard/dashboard.html'), 'utf8');

test.each(['live.html', 't-schedule.html', 'library.html'])('%s says clearly that it is not ready', (f) => {
    expect(read(f)).toContain('pg-soon-card');
    expect(read(f)).toContain('Tez orada');
});

describe('settings', () => {
    const s = read('settings.html');
    test('switches that do nothing are disabled and marked', () => {
        const notify = s.slice(s.indexOf('id="set-notify"'), s.indexOf('id="set-view"') > 0 ? s.indexOf('</section>', s.indexOf('id="set-notify"')) : undefined);
        expect(notify).toContain('Tez orada');
        expect((notify.match(/type="checkbox"/g) || []).length).toBe((notify.match(/type="checkbox" (checked )?disabled/g) || []).length);
        expect(s).toMatch(/Ikki bosqichli tasdiqlash <span class="pg-soon">/);
    });
    test('no fake save button, colour swatches or invented "2 months ago"', () => {
        expect(s).not.toContain('>Saqlash<');
        expect(s).not.toContain('pg-swatches');
        expect(s).not.toContain('2 oy oldin');
    });
    test('the theme choice and the profile shortcuts stay', () => {
        expect(s).toContain('data-theme-set="system"');
        expect((s.match(/data-open-page="profile"/g) || []).length).toBe(2);
        expect(s).toContain('data-logout');
    });
    test('side links point to real sections', () => {
        ['set-view', 'set-notify', 'set-security'].forEach((id) => { expect(s).toContain('href="#' + id + '"'); expect(s).toContain('id="' + id + '"'); });
    });
});

test('the header has no stock photo or invented name', () => {
    expect(dash).not.toContain('picsum.photos');
    expect(dash).not.toContain('Sunnat Ulashev');
});

describe('demo pages and legal texts carry no stock photo, personal name or removed features', () => {
    const base = path.join(__dirname, '../..');
    const all = (f) => fs.readFileSync(path.join(base, f), 'utf8');
    test.each(['profile', 'main.dashboard', 'results'])('%s has no stock photo or invented name', (n) => {
        const h = all(`secondary-pages/dashboard/pages/${n}.html`);
        expect(h).not.toContain('picsum.photos'); expect(h).not.toContain('Sunnat');
    });
    test('the bell badge starts hidden (no invented number)', () => {
        expect(dash).toMatch(/<span class="notification-badge" hidden/);
    });
    test('terms and privacy talk about competitions, not orders; the README matches the product', () => {
        const t = all('legal/terms.html'); const p = all('legal/privacy.html'); const r = all('README.md');
        expect(t).toContain('Musobaqalar'); expect(t).not.toMatch(/buyurtma/i);
        expect(p).not.toMatch(/buyurtma/i); expect(p).toContain('musobaqalar');
        expect(r).toContain('Hall of Fame'); expect(r).not.toMatch(/Real-time|Achievement System|Multer/);
    });
});
