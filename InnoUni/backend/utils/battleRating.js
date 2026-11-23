// Battle rating: ELO style. Every pair of teams in a battle is compared; the place decides who "won" the pair.
const START = 1000;
const K = 32;

const LEAGUES = [
    { name: 'Olmos', min: 1300 },
    { name: 'Oltin', min: 1200 },
    { name: 'Kumush', min: 1100 },
    { name: 'Bronza', min: 0 },
];
const leagueOf = (rating) => LEAGUES.find((l) => rating >= l.min).name;

// table: [{team_id, place}], ratings: {team_id: rating} -> {team_id: change}
function eloChanges(table, ratings) {
    const out = {};
    table.forEach((a) => {
        let sum = 0;
        table.forEach((b) => {
            if (a.team_id === b.team_id) return;
            const ra = ratings[a.team_id] ?? START; const rb = ratings[b.team_id] ?? START;
            const expected = 1 / (1 + Math.pow(10, (rb - ra) / 400));
            const actual = a.place < b.place ? 1 : a.place === b.place ? 0.5 : 0;
            sum += actual - expected;
        });
        out[a.team_id] = Math.round((K / Math.max(1, table.length - 1)) * sum);
    });
    return out;
}

const BADGES = [
    { id: 'first_win', name: "Birinchi g'alaba", test: (s) => s.wins >= 1 },
    { id: 'regular', name: 'Faol jangchi (3 battle)', test: (s) => s.played >= 3 },
    { id: 'champion', name: 'Chempion (5 g\'alaba)', test: (s) => s.wins >= 5 },
    { id: 'gold', name: 'Oltin liga', test: (s) => s.rating >= 1200 },
];
const badgesOf = (s) => BADGES.filter((b) => b.test(s)).map((b) => ({ id: b.id, name: b.name }));

module.exports = { START, K, leagueOf, eloChanges, badgesOf };
