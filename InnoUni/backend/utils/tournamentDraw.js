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

module.exports = { TOURNAMENT_LIMITS, groupCount, drawGroups, roundRobin };
