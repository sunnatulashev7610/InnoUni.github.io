// Personal results in quiz battles: answers, accuracy, MVP titles and personal badges.
// Only finished battles count (the team has a result), so nothing changes while a battle is running.
const MIN_ANSWERS_FOR_ACCURACY = 20;
const BADGES = [
    { id: 'first_battle', name: 'Birinchi battle', test: (s) => s.battles >= 1 },
    { id: 'veteran', name: 'Tajribali (5 battle)', test: (s) => s.battles >= 5 },
    { id: 'sharp', name: `Aniq nishon (${MIN_ANSWERS_FOR_ACCURACY}+ javob, 80%+)`, test: (s) => s.answered >= MIN_ANSWERS_FOR_ACCURACY && s.accuracy >= 80 },
    { id: 'mvp', name: 'Jamoa MVP', test: (s) => s.mvp >= 1 },
    { id: 'star', name: 'Jamoa yulduzi (3 MVP)', test: (s) => s.mvp >= 3 }
];
const badgesOf = (s) => BADGES.filter((b) => b.test(s)).map((b) => ({ id: b.id, name: b.name }));
const percent = (ok, n) => (n > 0 ? Math.round((Number(ok) / Number(n)) * 100) : 0);

// "Ali Valiyev" -> "Ali V."; a one-word name stays as it is
function shortName(full) {
    const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Foydalanuvchi';
    return parts.length === 1 ? parts[0] : `${parts[0]} ${Array.from(parts[1])[0].toUpperCase()}.`;
}

// rows: [{battle_id, team_id, user_id, ok, n}] of every team member in every finished battle the user played
function statsFromRows(rows, userId) {
    const mine = rows.filter((r) => r.user_id === userId);
    const answered = mine.reduce((t, r) => t + Number(r.n), 0);
    const correct = mine.reduce((t, r) => t + Number(r.ok), 0);
    let mvp = 0;
    for (const r of mine) {
        const mates = rows.filter((x) => x.battle_id === r.battle_id && x.team_id === r.team_id);
        const best = Math.max(...mates.map((x) => Number(x.ok)));
        if (mates.length >= 2 && Number(r.ok) > 0 && Number(r.ok) === best) mvp++;     // sharing the top spot counts for everybody
    }
    const s = { answered, correct, accuracy: percent(correct, answered), battles: new Set(mine.map((r) => r.battle_id)).size, mvp };
    return { ...s, badges: badgesOf(s) };
}

module.exports = { MIN_ANSWERS_FOR_ACCURACY, BADGES, badgesOf, percent, shortName, statsFromRows };
