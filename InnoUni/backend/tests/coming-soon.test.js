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
