// Meetup reminders: every member of the team is told 24 hours and 1 hour before a meetup, once each.
// Nobody runs a clock for us (the server may sleep), so this runs on a timer AND whenever somebody opens their notifications.
// A reminder is claimed with one UPDATE, so two runs at the same time cannot send it twice.
const { notify } = require('./notify');

const HOUR = 3600000;
const WINDOWS = [
    { flag: 'reminded_day', from: HOUR, to: 24 * HOUR, title: 'Uchrashuv 24 soatdan keyin' },
    { flag: 'reminded_hour', from: 0, to: HOUR, title: 'Uchrashuv 1 soatdan keyin' }
];
const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

async function sendDueReminders(db, now = Date.now()) {
    let sent = 0;
    for (const w of WINDOWS) {
        // Only meetups that were planned before the window began (planning one for tomorrow already told everybody)
        const [due] = await db.execute(
            `SELECT e.id, e.team_id, e.title, e.place, t.name AS team_name FROM team_events e JOIN teams t ON t.id = e.team_id WHERE e.${w.flag} = 0 AND e.starts_at > ? AND e.starts_at <= ? AND e.created_at < DATE_SUB(e.starts_at, INTERVAL ${w.to / HOUR} HOUR) ORDER BY e.starts_at LIMIT 50`,
            [sqlTime(now + w.from), sqlTime(now + w.to)]);
        for (const e of due) {
            const [claim] = await db.execute(`UPDATE team_events SET ${w.flag} = 1 WHERE id = ? AND ${w.flag} = 0`, [e.id]);
            if (!claim.affectedRows) continue;
            const [people] = await db.execute("SELECT user_id FROM team_members WHERE team_id = ? AND status = 'active'", [e.team_id]);
            await Promise.all(people.map((p) => notify(db, p.user_id, { kind: 'team', title: w.title, body: `${e.team_name}: ${e.title}${e.place ? ' · ' + e.place : ''}`, page: 'jamoalar', refId: e.team_id })));
            sent++;
        }
    }
    return sent;
}

// Safe to call often: at most once a minute per process, never throws
let last = 0;
function sendDueRemindersSoon(db) {
    if (Date.now() - last < 60000) return;
    last = Date.now();
    sendDueReminders(db).catch((e) => { if (process.env.NODE_ENV !== 'test') console.error('Reminders failed:', e.message); });
}

module.exports = { sendDueReminders, sendDueRemindersSoon };
