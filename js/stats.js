let players = [];
let allMatches = [];
let currentYear = 2026;

async function init() {
  const session = await initNav();
  if (!session) return;

  const [{ data: p }, { data: m }] = await Promise.all([
    db.from('players').select('*').order('name'),
    db.from('matches').select('*, match_blocks(*)').order('played_at', { ascending: true }),
  ]);
  players = p || [];
  allMatches = m || [];

  document.getElementById('year-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#year-filter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentYear = btn.dataset.year === 'all' ? 'all' : +btn.dataset.year;
    render();
  });

  render();
}

function getFilteredMatches() {
  if (currentYear === 'all') return allMatches;
  return allMatches.filter(m => new Date(m.played_at).getFullYear() === currentYear);
}

const getName = id => players.find(p => p.id === id)?.name || '?';

function pairKey(id1, id2) {
  return [id1, id2].sort().join('|');
}
function pairName(id1, id2) {
  return [getName(id1), getName(id2)].sort().join(' & ');
}

function render() {
  const matches = getFilteredMatches();
  renderQuickStats(matches);
  renderH2H(matches);
  renderBestWorst(matches);
  renderAvgScore(matches);
}

function renderQuickStats(matches) {
  if (matches.length === 0) { document.getElementById('quick-stats').innerHTML = ''; return; }

  const totalGames = matches.length;
  const scores = matches.map(m => {
    const t1 = m.match_blocks?.[0]?.team1_score || 0;
    const t2 = m.match_blocks?.[0]?.team2_score || 0;
    return { t1, t2, diff: Math.abs(t1 - t2), total: t1 + t2 };
  });
  const avgScore = (scores.reduce((a, s) => a + s.total, 0) / scores.length).toFixed(1);
  const closest = scores.reduce((a, b) => a.diff < b.diff ? a : b);
  const biggest = scores.reduce((a, b) => a.diff > b.diff ? a : b);
  const closestMatch = matches[scores.indexOf(closest)];
  const biggestMatch = matches[scores.indexOf(biggest)];

  document.getElementById('quick-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Games</div>
      <div class="stat-value">${totalGames}</div>
      <div class="stat-sub">${Math.floor(totalGames / 6)} full blocks</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Total Score</div>
      <div class="stat-value">${avgScore}</div>
      <div class="stat-sub">points per game</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Closest Game</div>
      <div class="stat-value" style="font-size:1.3rem">${closest.t1}-${closest.t2}</div>
      <div class="stat-sub">${getName(closestMatch.team1_player1_id)} & ${getName(closestMatch.team1_player2_id)} vs ${getName(closestMatch.team2_player1_id)} & ${getName(closestMatch.team2_player2_id)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Biggest Win</div>
      <div class="stat-value" style="font-size:1.3rem">${biggest.t1}-${biggest.t2}</div>
      <div class="stat-sub">${getName(biggestMatch.team1_player1_id)} & ${getName(biggestMatch.team1_player2_id)} vs ${getName(biggestMatch.team2_player1_id)} & ${getName(biggestMatch.team2_player2_id)}</div>
    </div>`;
}

function renderH2H(matches) {
  const h2h = {};

  matches.forEach(match => {
    const t1 = [match.team1_player1_id, match.team1_player2_id].sort();
    const t2 = [match.team2_player1_id, match.team2_player2_id].sort();
    const [teamA, teamB] = t1.join('<') < t2.join('<') ? [t1, t2] : [t2, t1];
    const teamAWon = t1.join('<') < t2.join('<') ? match.winner_team === 1 : match.winner_team === 2;
    const key = teamA.join('|') + '_vs_' + teamB.join('|');

    if (!h2h[key]) h2h[key] = { teamA, teamB, aWins: 0, bWins: 0, aPoints: 0, bPoints: 0, games: 0 };
    h2h[key].games++;
    const t1s = match.match_blocks?.[0]?.team1_score || 0;
    const t2s = match.match_blocks?.[0]?.team2_score || 0;
    const [aScore, bScore] = t1.join('<') < t2.join('<') ? [t1s, t2s] : [t2s, t1s];
    h2h[key].aPoints += aScore; h2h[key].bPoints += bScore;
    if (teamAWon) h2h[key].aWins++; else h2h[key].bWins++;
  });

  const rows = Object.values(h2h);
  if (rows.length === 0) { document.getElementById('h2h-table').innerHTML = '<p class="empty">Not enough data.</p>'; return; }

  document.getElementById('h2h-table').innerHTML = `
    <table class="h2h-table">
      <thead><tr><th>Pair A</th><th>W</th><th>Pts</th><th>vs</th><th>Pair B</th><th>W</th><th>Pts</th><th>Games</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="h2h-pair">${pairName(r.teamA[0], r.teamA[1])}</td>
            <td class="${r.aWins >= r.bWins ? 'h2h-win' : 'h2h-lose'}">${r.aWins}</td>
            <td>${r.aPoints}</td>
            <td style="color:var(--muted);font-size:0.8rem;">vs</td>
            <td class="h2h-pair">${pairName(r.teamB[0], r.teamB[1])}</td>
            <td class="${r.bWins >= r.aWins ? 'h2h-win' : 'h2h-lose'}">${r.bWins}</td>
            <td>${r.bPoints}</td>
            <td style="color:var(--muted)">${r.games}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderBestWorst(matches) {
  const blocks = [];
  for (let i = 0; i < matches.length; i += 6) blocks.push({ block: matches.slice(i, i + 6), num: Math.floor(i / 6) + 1 });

  if (blocks.length === 0) {
    document.getElementById('best-blocks').innerHTML = '<p class="empty">No data.</p>';
    document.getElementById('worst-blocks').innerHTML = '<p class="empty">No data.</p>';
    return;
  }

  const blockStats = blocks.map(({ block, num }) => {
    const stats = {};
    players.forEach(p => { stats[p.id] = { wins: 0, points: 0 }; });
    block.forEach(match => {
      const t1s = match.match_blocks?.[0]?.team1_score || 0;
      const t2s = match.match_blocks?.[0]?.team2_score || 0;
      [match.team1_player1_id, match.team1_player2_id].forEach(id => {
        if (!stats[id]) return;
        stats[id].points += t1s;
        if (match.winner_team === 1) stats[id].wins++;
      });
      [match.team2_player1_id, match.team2_player2_id].forEach(id => {
        if (!stats[id]) return;
        stats[id].points += t2s;
        if (match.winner_team === 2) stats[id].wins++;
      });
    });
    return { num, stats };
  });

  const renderBlockList = (el, sorted) => {
    document.getElementById(el).innerHTML = sorted.slice(0, 3).map(({ num, stats }) => {
      const ranked = Object.entries(stats).sort(([, a], [, b]) => b.wins - a.wins || b.points - a.points);
      return `<div class="block-result">
        <div><div class="block-result-label">Match ${num}</div>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:0.2rem;">${ranked.map(([id, s]) => `${getName(id)}: ${s.wins}W`).join(' · ')}</div></div>
      </div>`;
    }).join('');
  };

  // Best = most total wins for top player
  const byTopWins = [...blockStats].sort((a, b) => {
    const topA = Math.max(...Object.values(a.stats).map(s => s.wins));
    const topB = Math.max(...Object.values(b.stats).map(s => s.wins));
    return topB - topA;
  });

  renderBlockList('best-blocks', byTopWins);
  renderBlockList('worst-blocks', [...byTopWins].reverse());
}

function renderAvgScore(matches) {
  const matchups = {};
  matches.forEach(match => {
    const t1 = [match.team1_player1_id, match.team1_player2_id].sort();
    const t2 = [match.team2_player1_id, match.team2_player2_id].sort();
    const [teamA, teamB] = t1.join('<') < t2.join('<') ? [t1, t2] : [t2, t1];
    const key = teamA.join('|') + '_vs_' + teamB.join('|');
    const t1s = match.match_blocks?.[0]?.team1_score || 0;
    const t2s = match.match_blocks?.[0]?.team2_score || 0;
    const [aScore, bScore] = t1.join('<') < t2.join('<') ? [t1s, t2s] : [t2s, t1s];

    if (!matchups[key]) matchups[key] = { teamA, teamB, aTotal: 0, bTotal: 0, games: 0 };
    matchups[key].aTotal += aScore; matchups[key].bTotal += bScore; matchups[key].games++;
  });

  const rows = Object.values(matchups);
  if (rows.length === 0) { document.getElementById('avg-score').innerHTML = '<p class="empty">Not enough data.</p>'; return; }

  document.getElementById('avg-score').innerHTML = `
    <table class="h2h-table">
      <thead><tr><th>Pair A</th><th>Avg</th><th>vs</th><th>Pair B</th><th>Avg</th><th>Games</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="h2h-pair">${pairName(r.teamA[0], r.teamA[1])}</td>
            <td class="wins">${(r.aTotal / r.games).toFixed(1)}</td>
            <td style="color:var(--muted);font-size:0.8rem;">vs</td>
            <td class="h2h-pair">${pairName(r.teamB[0], r.teamB[1])}</td>
            <td class="wins">${(r.bTotal / r.games).toFixed(1)}</td>
            <td style="color:var(--muted)">${r.games}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

init();
