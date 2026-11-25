// Meetup reminders: 24 hours and 1 hour before, once each, to every active member
const { createTeamsFake } = require('./helpers/teamsFake');
const { sendDueReminders } = require('../utils/reminders');

const H = 3600000; const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
let fake, db, team;
const event = (id, startsInH, createdAgoH, extra = {}) => { const e = Object.assign({ id, team_id: team, user_id: 1, title: 'Kod kechasi', place: 'Kutubxona', note: null, starts_at: new Date(NOW + startsInH * H), created_at: NOW - createdAgoH * H }, extra); fake.s.events.push(e); return e; };
const told = (title) => fake.s.notices.filter((n) => n.title === title);

beforeEach(() => {
    fake = createTeamsFake(); db = fake.db;
    fake.s.teams.push({ id: 5, name: 'Alfa jamoa', captain_id: 1 }); team = 5;
    fake.addMember(5, 1, 'active'); fake.addMember(5, 2, 'active'); fake.addMember(5, 3, 'pending'); fake.addMember(5, 4, 'active');
});

test('about a day before: every active member gets one reminder with team, title and place', async () => {
    event(1, 23, 72);
    expect(await sendDueReminders(db, NOW)).toBe(1);
    const n = told('Uchrashuv 24 soatdan keyin');
    expect(n.map((x) => x.user_id).sort()).toEqual([1, 2, 4]);            // the pending one is not told
    expect(n[0]).toMatchObject({ kind: 'team', body: 'Alfa jamoa: Kod kechasi · Kutubxona', page: 'jamoalar', ref_id: 5 });
});

test('each reminder is sent once, however often the check runs', async () => {
    event(1, 23, 72);
    await sendDueReminders(db, NOW); await sendDueReminders(db, NOW + 600000);
    expect(told('Uchrashuv 24 soatdan keyin')).toHaveLength(3);
});

test('an hour before: the second reminder; the first is not repeated', async () => {
    event(1, 23, 72);
    await sendDueReminders(db, NOW);
    await sendDueReminders(db, NOW + 22.5 * H);                           // 30 minutes to go
    expect(told('Uchrashuv 24 soatdan keyin')).toHaveLength(3);
    expect(told('Uchrashuv 1 soatdan keyin')).toHaveLength(3);
});

test('too early: nothing; already started: nothing', async () => {
    event(1, 30, 72); event(2, -1, 72);
    expect(await sendDueReminders(db, NOW)).toBe(0);
    expect(fake.s.notices).toHaveLength(0);
});

test('a meetup planned only a few hours ahead does not repeat the "new meetup" news as a 24-hour reminder', async () => {
    event(1, 10, 1);                                                        // created 1 hour ago, starts in 10 hours
    expect(await sendDueReminders(db, NOW)).toBe(0);
    await sendDueReminders(db, NOW + 9.5 * H);                              // the hour reminder is still sent
    expect(told('Uchrashuv 1 soatdan keyin')).toHaveLength(3);
});

test('a late check (server was asleep) sends only the hour reminder, not both', async () => {
    event(1, 0.5, 72);
    await sendDueReminders(db, NOW);
    expect(told('Uchrashuv 24 soatdan keyin')).toHaveLength(0);
    expect(told('Uchrashuv 1 soatdan keyin')).toHaveLength(3);
});

test('two meetups, two teams: each reminder goes to its own team only', async () => {
    fake.s.teams.push({ id: 6, name: 'Beta', captain_id: 7 }); fake.addMember(6, 7, 'active');
    event(1, 20, 72); event(2, 20, 72, { team_id: 6, title: 'Boshqa' });
    expect(await sendDueReminders(db, NOW)).toBe(2);
    expect(fake.s.notices.filter((n) => n.user_id === 7).map((n) => n.body)).toEqual(['Beta: Boshqa · Kutubxona']);
});
