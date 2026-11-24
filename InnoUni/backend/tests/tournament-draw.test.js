const { groupCount, drawGroups, roundRobin } = require('../utils/tournamentDraw');

describe('groups', () => {
    test('only counts that make groups of 3-4 with a clean playoff are valid', () => {
        expect([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17].map(groupCount)).toEqual([null, 1, null, 2, 2, 2, null, null, null, 4, 4, null]);
    });
    test('snake seeding splits the strongest teams between groups', () => {
        const teams = [1000, 1300, 1100, 1200, 900, 1050, 1150, 950].map((rating, i) => ({ team_id: i + 1, rating }));
        const g = drawGroups(teams).map((x) => x.map((t) => t.team_id));
        // order by rating: 2(1300) 4(1200) 7(1150) 3(1100) 6(1050) 1(1000) 8(950) 5(900) -> groups A,B,B,A,A,B,B,A
        expect(g).toEqual([[2, 3, 6, 5], [4, 7, 1, 8]]);
        expect(g.flat().sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
    test('equal ratings are placed by team id, so the draw is repeatable', () => {
        const a = drawGroups([4, 3, 2, 1].map((id) => ({ team_id: id, rating: 1000 })));
        const b = drawGroups([1, 2, 3, 4].map((id) => ({ team_id: id, rating: 1000 })));
        expect(a).toEqual(b);
    });
    test('a bad count gives no draw', () => { expect(drawGroups([{ team_id: 1, rating: 1 }])).toBeNull(); });
});

describe('round robin', () => {
    const meetings = (rounds) => rounds.flat().map(([a, b]) => [a, b].sort().join('-')).sort();
    test('4 teams: 3 rounds, 2 matches each, everybody meets everybody once', () => {
        const r = roundRobin([1, 2, 3, 4]);
        expect(r).toHaveLength(3); r.forEach((x) => expect(x).toHaveLength(2));
        expect(meetings(r)).toEqual(['1-2', '1-3', '1-4', '2-3', '2-4', '3-4']);
        r.forEach((x) => expect(new Set(x.flat()).size).toBe(4));   // nobody plays twice in a round
    });
    test('3 teams: 3 rounds, one match each, one team rests every round', () => {
        const r = roundRobin([1, 2, 3]);
        expect(r.map((x) => x.length)).toEqual([1, 1, 1]);
        expect(meetings(r)).toEqual(['1-2', '1-3', '2-3']);
    });
});

describe('group table', () => {
    const { standings } = require('../utils/tournamentDraw');
    const teams = [1, 2, 3].map((id) => ({ team_id: id, name: 'T' + id, seed_rating: 1000 + id }));
    test('win 3, draw 1, loss 0; then difference; unfinished matches do not count', () => {
        const t = standings(teams, [
            { team_a: 1, team_b: 2, score_a: 5, score_b: 2 },
            { team_a: 2, team_b: 3, score_a: 4, score_b: 4 },
            { team_a: 1, team_b: 3, score_a: null, score_b: null }]);
        expect(t.map((r) => [r.team_id, r.points, r.diff, r.played])).toEqual([[1, 3, 3, 1], [3, 1, 0, 1], [2, 1, -3, 2]].map((x) => x));
        expect(t.map((r) => r.rank)).toEqual([1, 2, 3]);
    });
    test('equal points: difference, then score for, then the stronger seed', () => {
        const t = standings(teams, [{ team_a: 1, team_b: 2, score_a: 3, score_b: 3 }]);
        expect(t.map((r) => r.team_id)).toEqual([2, 1, 3]);   // 1 and 2 drew (1 point each, seed 1002 > 1001); 3 has not played
    });
    test('scores are summed without floating point noise', () => {
        const t = standings(teams, [{ team_a: 1, team_b: 2, score_a: 3.33, score_b: 0 }, { team_a: 1, team_b: 3, score_a: 3.33, score_b: 0 }]);
        expect(t[0]).toMatchObject({ team_id: 1, diff: 6.66, score_for: 6.66 });
    });
});
