// Seasonal tournament maths: how many groups, who goes to which group, who plays whom in which round.
// Groups hold 3-4 teams; the best 2 of every group reach the playoffs, so 2, 4 or 8 teams go on (no byes).
const TOURNAMENT_LIMITS = {
    minTeams: 4,
    maxTeams: 16,
    maxTitleLength: 100,
    maxTopicLength: 200,
    minRoundDays: 1,
    maxRoundDays: 7,
    defaultRoundDays: 2,
    validCounts: [4, 6, 7, 8, 12, 13, 14, 15, 16]
};

// Number of groups for n teams, or null when n cannot make groups of 3-4 with a clean playoff
function groupCount(n) {
    if (!TOURNAMENT_LIMITS.validCounts.includes(n)) return null;
    if (n <= 4) return 1;
    if (n <= 8) return 2;
    return 4;
}

// Snake seeding: strongest teams go to different groups (1,2,3,4 then 4,3,2,1 ...). teams: [{team_id, rating}]
function drawGroups(teams) {
    const g = groupCount(teams.length);
    if (!g) return null;
    const sorted = teams.slice().sort((a, b) => b.rating - a.rating || a.team_id - b.team_id);
    const groups = Array.from({ length: g }, () => []);
    sorted.forEach((t, i) => {
        const lap = Math.floor(i / g); const pos = i % g;
        groups[lap % 2 === 0 ? pos : g - 1 - pos].push(t);
    });
    return groups;
}

// Everybody plays everybody once (circle method). Returns rounds: [[ [a, b], ... ], ...]; with an odd count one team rests each round.
function roundRobin(ids) {
    const arr = ids.slice(); if (arr.length % 2) arr.push(null);
    const n = arr.length; const rounds = [];
    for (let r = 0; r < n - 1; r++) {
        const pairs = [];
        for (let i = 0; i < n / 2; i++) { const a = arr[i]; const b = arr[n - 1 - i]; if (a !== null && b !== null) pairs.push([a, b]); }
        rounds.push(pairs);
        arr.splice(1, 0, arr.pop());
    }
    return rounds;
}

// Group table: win 3, draw 1, loss 0; then score difference, then score for, then the seed rating, then team id.
// matches: [{team_a, team_b, score_a, score_b}] - only finished ones (both scores numbers) count.
function standings(teams, matches) {
    const row = {};
    teams.forEach((t) => { row[t.team_id] = { team_id: t.team_id, name: t.name, seed_rating: t.seed_rating || 0, played: 0, won: 0, drawn: 0, lost: 0, points: 0, diff: 0, score_for: 0 }; });
    matches.forEach((m) => {
        if (typeof m.score_a !== 'number' || typeof m.score_b !== 'number' || !row[m.team_a] || !row[m.team_b]) return;
        const a = row[m.team_a]; const b = row[m.team_b];
        a.played++; b.played++;
        a.score_for += m.score_a; b.score_for += m.score_b;
        a.diff += m.score_a - m.score_b; b.diff += m.score_b - m.score_a;
        if (m.score_a > m.score_b) { a.won++; a.points += 3; b.lost++; }
        else if (m.score_a < m.score_b) { b.won++; b.points += 3; a.lost++; }
        else { a.drawn++; b.drawn++; a.points++; b.points++; }
    });
    const round2 = (x) => Math.round(x * 100) / 100;
    return Object.values(row).map((r) => ({ ...r, diff: round2(r.diff), score_for: round2(r.score_for) }))
        .sort((x, y) => y.points - x.points || y.diff - x.diff || y.score_for - x.score_for || y.seed_rating - x.seed_rating || x.team_id - y.team_id)
        .map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---- Playoffs: the best 2 of every group; knockout (quarter-final -> semi-final -> final) ----
const STAGES = ['quarter', 'semi', 'final'];
const STAGE_TITLE = { quarter: 'Chorak final', semi: 'Yarim final', final: 'Final' };

// groups: [{group_no, table:[{team_id, rank}]}] sorted by group. Winners meet runners-up of another group (A1-B2, B1-A2 ...).
function playoffPairs(groups) {
    const g = groups.slice().sort((x, y) => x.group_no - y.group_no);
    const top = (i, rank) => (g[i].table.find((r) => r.rank === rank) || {}).team_id;
    if (g.length === 1) return [[top(0, 1), top(0, 2)]];
    if (g.length === 2) return [[top(0, 1), top(1, 2)], [top(1, 1), top(0, 2)]];
    if (g.length === 4) return [[top(0, 1), top(1, 2)], [top(2, 1), top(3, 2)], [top(1, 1), top(0, 2)], [top(3, 1), top(2, 2)]];
    return null;
}
const firstStage = (pairCount) => ({ 1: 'final', 2: 'semi', 4: 'quarter' }[pairCount] || null);

// Winners of a stage (in match order) meet two by two in the next one
function nextPairs(winners) {
    const out = [];
    for (let i = 0; i + 1 < winners.length; i += 2) out.push([winners[i], winners[i + 1]]);
    return out;
}

// Knockout winner of a finished match. A draw goes to the team that was better in the groups (lower rank, then higher seed rating).
// rankOf: {team_id: {rank, seed_rating}}
function knockoutWinner(m, rankOf) {
    if (typeof m.score_a !== 'number' || typeof m.score_b !== 'number') return null;
    if (m.score_a !== m.score_b) return m.score_a > m.score_b ? m.team_a : m.team_b;
    const a = rankOf[m.team_a] || { rank: 99, seed_rating: 0 }; const b = rankOf[m.team_b] || { rank: 99, seed_rating: 0 };
    if (a.rank !== b.rank) return a.rank < b.rank ? m.team_a : m.team_b;
    return a.seed_rating >= b.seed_rating ? m.team_a : m.team_b;
}

module.exports = { TOURNAMENT_LIMITS, groupCount, drawGroups, roundRobin, standings, STAGES, STAGE_TITLE, playoffPairs, firstStage, nextPairs, knockoutWinner };
