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
function pairName(id1, id2) { return [getName(id1), getName(id2)].sort().join(' & '); }

function render() {
  const matches = getFilteredMatches();
  renderQuickStats(matches);
  renderH2H(matches);
  renderAvgScore(matches);
}

/* ── Quick Stats ── */
function getMostDFsInBlock(matches) {
  let maxDFs = 0, maxPlayerId = null, maxBlockNum = null;
  for (let i = 0; i < matches.length; i += 6) {
    const block = matches.slice(i, i + 6);
    const blockNum = Math.floor(i / 6) + 1;
    const dfs = {};
    block.forEach(m => {
      [
        { id: m.team1_player1_id, df: m.t1p1_df || 0 },
        { id: m.team1_player2_id, df: m.t1p2_df || 0 },
        { id: m.team2_player1_id, df: m.t2p1_df || 0 },
        { id: m.team2_player2_id, df: m.t2p2_df || 0 },
      ].forEach(({ id, df }) => {
        if (!id) return;
        dfs[id] = (dfs[id] || 0) + df;
        if (dfs[id] > maxDFs) { maxDFs = dfs[id]; maxPlayerId = id; maxBlockNum = blockNum; }
      });
    });
  }
  return { playerId: maxPlayerId, count: maxDFs, blockNum: maxBlockNum };
}

function getLongestStreak(matches) {
  const streaks = {}, current = {};
  players.forEach(p => { streaks[p.id] = 0; current[p.id] = 0; });
  matches.forEach(match => {
    players.forEach(p => {
      const inT1 = match.team1_player1_id === p.id || match.team1_player2_id === p.id;
      const inT2 = match.team2_player1_id === p.id || match.team2_player2_id === p.id;
      if (!inT1 && !inT2) return;
      const won = (inT1 && match.winner_team === 1) || (inT2 && match.winner_team === 2);
      if (won) { current[p.id]++; if (current[p.id] > streaks[p.id]) streaks[p.id] = current[p.id]; }
      else current[p.id] = 0;
    });
  });
  let maxStreak = 0, maxPlayerId = null;
  Object.entries(streaks).forEach(([id, s]) => { if (s > maxStreak) { maxStreak = s; maxPlayerId = id; } });
  return { playerId: maxPlayerId, count: maxStreak };
}

function renderQuickStats(matches) {
  if (matches.length === 0) { document.getElementById('quick-stats').innerHTML = ''; return; }

  const totalGames = matches.length;
  const scores = matches.map(m => {
    const t1 = m.match_blocks?.[0]?.team1_score || 0;
    const t2 = m.match_blocks?.[0]?.team2_score || 0;
    return t1 + t2;
  });
  const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);

  const dfStat = getMostDFsInBlock(matches);
  const streakStat = getLongestStreak(matches);

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
      <div class="stat-label">⚡ Most DFs in a Block</div>
      <div class="stat-value" style="font-size:1.4rem">${dfStat.count > 0 ? dfStat.count : '—'}</div>
      <div class="stat-sub">${dfStat.count > 0 ? `${getName(dfStat.playerId)} · Match ${dfStat.blockNum}` : 'No double faults yet'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">🔥 Longest Win Streak</div>
      <div class="stat-value" style="font-size:1.4rem">${streakStat.count > 0 ? streakStat.count : '—'}</div>
      <div class="stat-sub">${streakStat.count > 0 ? `${getName(streakStat.playerId)} consecutive wins` : 'No data'}</div>
    </div>`;
}

/* ── Head to Head ── */
function renderH2H(matches) {
  const h2h = {};
  matches.forEach(match => {
    const t1 = [match.team1_player1_id, match.team1_player2_id].sort();
    const t2 = [match.team2_player1_id, match.team2_player2_id].sort();
    const [teamA, teamB] = t1.join('<') < t2.join('<') ? [t1, t2] : [t2, t1];
    const teamAWon = t1.join('<') < t2.join('<') ? match.winner_team === 1 : match.winner_team === 2;
    const key = teamA.join('|') + '_vs_' + teamB.join('|');
    if (!h2h[key]) h2h[key] = { teamA, teamB, aWins: 0, bWins: 0, games: 0 };
    h2h[key].games++;
    if (teamAWon) h2h[key].aWins++; else h2h[key].bWins++;
  });

  const rows = Object.values(h2h);
  if (rows.length === 0) { document.getElementById('h2h-table').innerHTML = '<p class="empty">Not enough data.</p>'; return; }

  document.getElementById('h2h-table').innerHTML = `<div class="h2h-list">` + rows.map(r => {
    const aRate = r.games > 0 ? Math.round((r.aWins / r.games) * 100) : 0;
    const bRate = 100 - aRate;
    const aWinning = r.aWins >= r.bWins;
    return `
      <div class="h2h-matchup">
        <div class="h2h-side ${aWinning ? 'h2h-green' : 'h2h-red'}">
          <div class="h2h-pair-name">${pairName(r.teamA[0], r.teamA[1])}</div>
          <div class="h2h-winrate">${r.aWins}W · ${aRate}%</div>
        </div>
        <div class="h2h-center">
          <div class="h2h-vs-label">vs</div>
          <div class="h2h-games-label">${r.games} game${r.games !== 1 ? 's' : ''}</div>
        </div>
        <div class="h2h-side ${!aWinning ? 'h2h-green' : 'h2h-red'}">
          <div class="h2h-pair-name">${pairName(r.teamB[0], r.teamB[1])}</div>
          <div class="h2h-winrate">${r.bWins}W · ${bRate}%</div>
        </div>
      </div>`;
  }).join('') + `</div>`;
}

/* ── Average Score per Matchup ── */
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

  document.getElementById('avg-score').innerHTML = `<div class="avg-list">` + rows.map(r => `
    <div class="avg-score-row">
      <span class="avg-team">${pairName(r.teamA[0], r.teamA[1])}</span>
      <span class="avg-val">${(r.aTotal / r.games).toFixed(1)}</span>
      <span class="avg-vs">vs</span>
      <span class="avg-val">${(r.bTotal / r.games).toFixed(1)}</span>
      <span class="avg-team avg-team-right">${pairName(r.teamB[0], r.teamB[1])}</span>
      <span class="avg-games">${r.games}</span>
    </div>`).join('') + `</div>`;
}

init();
