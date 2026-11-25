// The home page describes the product as it is now: teams, competitions, AI tools; students only; no made-up numbers or paid plans
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

test('every menu link points to a section that exists', () => {
    const links = [...html.matchAll(/<ul class="ge-nav-links">([\s\S]*?)<\/ul>/g)][0][1].match(/href="#([^"]+)"/g).map((h) => h.slice(7, -1));
    expect(links).toEqual(['imkoniyatlar', 'qanday', 'musobaqalar', 'contact']);
    links.forEach((id) => expect(html).toContain(`id="${id}"`));
});
test('it talks about teams, battles, the tournament and the AI tools', () => {
    ['Jamoalar', 'Battle musobaqalari', 'Mavsumiy turnir', 'Reyting va ligalar', 'AI yordamchi'].forEach((t) => expect(html).toContain(t));
});
test('closed or removed parts are not advertised: teachers, groups, catalog courses, orders, paid plans, invented numbers', () => {
    [/O'qituvchi:/, /Kurs guruhlari/, /Jonli darslar/, /Buyurtma/i, /so'm/, /ge-plan/, /1 200\+/, /85<\/b>/, /Narxlar/].forEach((re) => expect(html).not.toMatch(re));
});
test('the contact form and the legal links are still there', () => {
    expect(html).toContain('id="contactForm"');
    ['legal/privacy.html', 'legal/terms.html', 'legal/cookies.html'].forEach((l) => expect(html).toContain(l));
});
