const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

describe('Netlify hosting', () => {
    const t = read('netlify.toml');
    test('publishes the repository root without a build, and sends the root to the app', () => {
        expect(t).toMatch(/publish = "\."/);
        expect(t).toMatch(/from = "\/"\s+to = "\/InnoUni\/index\.html"\s+status = 301/);
    });
    test('the backend folder is not served', () => {
        expect(t).toMatch(/from = "\/InnoUni\/backend\/\*"/);
    });
    test('the 404 page finds the app folder on netlify.app', () => {
        expect(read('404.html')).toContain("netlify\\.app$/.test(location.hostname) ? '/InnoUni/'");
    });
    test('the API address stays the Render server; no secrets in the toml', () => {
        expect(read('InnoUni/frontend/js/config.js')).toContain('onrender.com/api');
        expect(t).not.toMatch(/KEY|SECRET|PASSWORD|TOKEN/i);
    });
});
