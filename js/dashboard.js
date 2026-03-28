let players = [];
let currentUser = null;
let leaderboardYear = 2026;
let historyYear = 2026;

async function init() {
  const session = await initNav();
  if (!session) return;
  currentUser = session.user;

  await loadPlayers();
  await Promise.all([loadLeaderboard(leaderboardYear), loadMatchHistory(historyYear)]);
  setupFilters();
}

function setupFilters() {
  document.getElementById('leaderboard-filter').addEventListener('click', async (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#leaderboard-filter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    leaderboardYear = btn.dataset.year === 'all' ? 'all' : (btn.dataset.year === 'current' ? 'current' : +btn.dataset.year);
    await loadLeaderboard(leaderboardYear);
  });

  document.getElementById('history-filter').addEventListener('click', async (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#history-filter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    historyYear = btn.dataset.year === 'all' ? 'all' : +btn.dataset.year;
    await loadMatchHistory(historyYear);
  });
}

function updateDFLabels() {
  ['t1p1', 't1p2', 't2p1', 't2p2'].forEach(id => {
    const sel = document.getElementById(id);
    const label = document.getElementById(`df-label-${id}`);
    const name = sel.options[sel.selectedIndex]?.text;
    label.textContent = (name && name !== 'Select player') ? name : id.toUpperCase();
  });
}

async function loadPlayers() {
  const { data } = await db.from('players').select('*').order('name');
  players = data || [];
  ['t1p1', 't1p2', 't2p1', 't2p2'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="">Select player</option>';
    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', updateDFLabels);
  });
}

/* ── Leaderboard ── */
async function loadLeaderboard(year) {
  if (year === 'current') { await loadCurrentBlock(); return; }

  let query = db.from('matches').select('*, match_blocks(*)');
  if (year !== 'all') query = query.gte('played_at', `${year}-01-01T00:00:00`).lte('played_at', `${year}-12-31T23:59:59`);
  const { data: matches } = await query;

  const stats = {};
  players.forEach(p => { stats[p.id] = { name: p.name, played: 0, wins: 0, points: 0, doubleFaults: 0 }; });

  (matches || []).forEach(match => {
    const t1s = match.match_blocks?.[0]?.team1_score || 0;
    const t2s = match.match_blocks?.[0]?.team2_score || 0;
    [{ id: match.team1_player1_id, df: match.t1p1_df || 0 }, { id: match.team1_player2_id, df: match.t1p2_df || 0 }].forEach(({ id, df }) => {
      if (!stats[id]) return;
      stats[id].played++; stats[id].points += t1s; stats[id].doubleFaults += df;
      match.winner_team === 1 ? stats[id].wins++ : 0;
    });
    [{ id: match.team2_player1_id, df: match.t2p1_df || 0 }, { id: match.team2_player2_id, df: match.t2p2_df || 0 }].forEach(({ id, df }) => {
      if (!stats[id]) return;
      stats[id].played++; stats[id].points += t2s; stats[id].doubleFaults += df;
      match.winner_team === 2 ? stats[id].wins++ : 0;
    });
  });

  const totalPlayed = (matches || []).length;
  const sorted = Object.values(stats).sort((a, b) => b.wins - a.wins || b.points - a.points || a.doubleFaults - b.doubleFaults);

  document.getElementById('leaderboard').innerHTML = `
    <div style="padding:0.5rem 1.5rem 0;font-size:0.75rem;color:var(--muted);">${totalPlayed} games played total</div>
    <table class="leaderboard-table">
      <thead><tr><th>#</th><th>Player</th><th>Wins</th><th>Points</th><th>Win Rate</th><th>DF</th></tr></thead>
      <tbody>
        ${sorted.map((p, i) => `
          <tr>
            <td class="rank">${i + 1}</td>
            <td class="player-name">${p.name}</td>
            <td class="wins">${p.wins}</td>
            <td>${p.points}</td>
            <td>${p.played > 0 ? Math.round((p.wins / p.played) * 100) + '%' : '-'}</td>
            <td class="df-count">${p.doubleFaults}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

/* ── Current Block ── */
async function loadCurrentBlock() {
  const { data: matches } = await db.from('matches')
    .select('*, match_blocks(*)')
    .order('played_at', { ascending: true });

  const el = document.getElementById('leaderboard');
  if (!matches || matches.length === 0) { el.innerHTML = '<p class="empty">No matches yet.</p>'; return; }

  const blockStart = Math.floor((matches.length - 1) / 6) * 6;
  const block = matches.slice(blockStart);
  const blockNum = Math.floor(blockStart / 6) + 1;

  const stats = {};
  players.forEach(p => { stats[p.id] = { name: p.name, wins: 0, points: 0, dfs: 0 }; });

  block.forEach(match => {
    const t1s = match.match_blocks?.[0]?.team1_score || 0;
    const t2s = match.match_blocks?.[0]?.team2_score || 0;
    [
      { id: match.team1_player1_id, score: t1s, df: match.t1p1_df || 0, won: match.winner_team === 1 },
      { id: match.team1_player2_id, score: t1s, df: match.t1p2_df || 0, won: match.winner_team === 1 },
      { id: match.team2_player1_id, score: t2s, df: match.t2p1_df || 0, won: match.winner_team === 2 },
      { id: match.team2_player2_id, score: t2s, df: match.t2p2_df || 0, won: match.winner_team === 2 },
    ].forEach(({ id, score, df, won }) => {
      if (!stats[id]) return;
      stats[id].points += score; stats[id].dfs += df;
      if (won) stats[id].wins++;
    });
  });

  const sorted = Object.values(stats).sort((a, b) => b.wins - a.wins || b.points - a.points || a.dfs - b.dfs);
  const lastIdx = sorted.length - 1;

  let beerHtml = '';
  if (block.length === 5) {
    const analysis = generateBeerAnalysis(block);
    if (analysis) beerHtml = `<div class="beer-analysis-box">${analysis}</div>`;
  } else if (block.length === 6) {
    beerHtml = `<div class="beer-analysis-box beer-analysis-done">✅ Block complete — check the Beer Counter for final result.</div>`;
  }

  el.innerHTML = `
    <div style="padding:0.6rem 1.5rem 0;font-size:0.78rem;color:var(--muted);">Match ${blockNum} · ${block.length}/6 games played</div>
    <table class="leaderboard-table">
      <thead><tr><th>#</th><th>Player</th><th>W</th><th>Pts</th><th>DF</th></tr></thead>
      <tbody>
        ${sorted.map((p, i) => `
          <tr class="${i === lastIdx && block.length >= 3 ? 'beer-row' : ''}">
            <td class="rank">${i + 1}</td>
            <td class="player-name">${p.name}</td>
            <td class="wins">${p.wins}</td>
            <td>${p.points}</td>
            <td class="df-count">${p.dfs}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    ${beerHtml}`;
}

/* ── Beer Analysis (5/6 matches played) ── */
function generateBeerAnalysis(blockMatches) {
  const playerSet = new Set();
  blockMatches.forEach(m => {
    [m.team1_player1_id, m.team1_player2_id, m.team2_player1_id, m.team2_player2_id]
      .forEach(id => { if (id) playerSet.add(id); });
  });
  const playerIds = [...playerSet];
  if (playerIds.length !== 4) return null;

  // Find which matchup has been played only once (= the upcoming 6th game)
  const matchupCounts = {};
  blockMatches.forEach(m => {
    const t1 = [m.team1_player1_id, m.team1_player2_id].sort();
    const t2 = [m.team2_player1_id, m.team2_player2_id].sort();
    const [tA, tB] = t1.join('') < t2.join('') ? [t1, t2] : [t2, t1];
    const key = `${tA.join('|')}||${tB.join('|')}`;
    if (!matchupCounts[key]) matchupCounts[key] = { tA, tB, count: 0 };
    matchupCounts[key].count++;
  });

  const remaining = Object.values(matchupCounts).find(c => c.count === 1);
  if (!remaining) return null;

  const team1 = remaining.tA;
  const team2 = remaining.tB;

  // Base stats from the 5 matches
  const base = {};
  playerIds.forEach(id => { base[id] = { wins: 0, points: 0, dfs: 0 }; });
  blockMatches.forEach(m => {
    const t1s = m.match_blocks?.[0]?.team1_score || 0;
    const t2s = m.match_blocks?.[0]?.team2_score || 0;
    [
      { id: m.team1_player1_id, score: t1s, df: m.t1p1_df || 0, won: m.winner_team === 1 },
      { id: m.team1_player2_id, score: t1s, df: m.t1p2_df || 0, won: m.winner_team === 1 },
      { id: m.team2_player1_id, score: t2s, df: m.t2p1_df || 0, won: m.winner_team === 2 },
      { id: m.team2_player2_id, score: t2s, df: m.t2p2_df || 0, won: m.winner_team === 2 },
    ].forEach(({ id, score, df, won }) => {
      if (!base[id]) return;
      if (won) base[id].wins++;
      base[id].points += score;
      base[id].dfs += df;
    });
  });

  const getName = id => players.find(p => p.id === id)?.name || '?';
  const teamStr = ids => ids.map(getName).join(' & ');

  function getLastPlace(s) {
    return Object.entries(s).sort(([, a], [, b]) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.points !== a.points) return b.points - a.points;
      return a.dfs - b.dfs;
    }).pop()[0];
  }

  function sim(t1wins, t1Score, t2Score) {
    const s = {};
    playerIds.forEach(id => { s[id] = { ...base[id] }; });
    team1.forEach(id => { s[id].points += t1Score; if (t1wins) s[id].wins++; });
    team2.forEach(id => { s[id].points += t2Score; if (!t1wins) s[id].wins++; });
    return getLastPlace(s);
  }

  // Scores from most to least dominant for winning team
  const scores = [[6,0],[6,1],[6,2],[6,3],[6,4],[6,5],[7,5]];
  const t1Results = scores.map(([ws, ls]) => ({ ws, ls, loser: sim(true, ws, ls) }));
  const t2Results = scores.map(([ws, ls]) => ({ ws, ls, loser: sim(false, ws, ls) }));

  // All possible losers across every scenario
  const allLosers = new Set([...t1Results, ...t2Results].map(r => r.loser));
  if (allLosers.size === 1) {
    return `🍺 <strong>${getName([...allLosers][0])}</strong> is guaranteed to owe a beer — no matter what!`;
  }

  function buildMsg(results, winTeam) {
    const loserSet = new Set(results.map(r => r.loser));
    if (loserSet.size === 1) return `<strong>${getName([...loserSet][0])}</strong> owes a beer`;

    const firstLoser = results[0].loser;
    const splitIdx = results.findIndex(r => r.loser !== firstLoser);
    if (splitIdx === -1) return `<strong>${getName(firstLoser)}</strong> owes a beer`;

    const secondLoser = results[splitIdx].loser;
    // threshold = last score where firstLoser is still last (most dominant wins)
    const threshold = `${results[splitIdx - 1].ws}–${results[splitIdx - 1].ls}`;

    if (winTeam.includes(secondLoser)) {
      // secondLoser is on winning team, they owe beer with close wins
      // They need to win dominantly enough (threshold or better) to escape
      return `<strong>${getName(secondLoser)}</strong> needs to win <strong>${threshold} or better</strong> to avoid owing beer — if so, <strong>${getName(firstLoser)}</strong> owes instead`;
    }
    // firstLoser is on winning team, they owe with dominant wins
    return `<strong>${getName(firstLoser)}</strong> owes beer unless the score is <strong>${threshold} or closer</strong> — then <strong>${getName(secondLoser)}</strong> owes instead`;
  }

  const t1Losers = new Set(t1Results.map(r => r.loser));
  const t2Losers = new Set(t2Results.map(r => r.loser));

  // Simple case: outcome same regardless of score, only depends on which team wins
  if (t1Losers.size === 1 && t2Losers.size === 1) {
    const loserT1 = [...t1Losers][0];
    const loserT2 = [...t2Losers][0];
    return `If <strong>${teamStr(team1)}</strong> win → <strong>${getName(loserT1)}</strong> owes a beer.<br>If <strong>${teamStr(team2)}</strong> win → <strong>${getName(loserT2)}</strong> owes a beer.`;
  }

  // Score-dependent
  return [
    `If <strong>${teamStr(team1)}</strong> win: ${buildMsg(t1Results, team1)}.`,
    `If <strong>${teamStr(team2)}</strong> win: ${buildMsg(t2Results, team2)}.`
  ].join('<br>');
}

/* ── Match History ── */
async function loadMatchHistory(year) {
  let query = db.from('matches').select('*, match_blocks(*)').order('played_at', { ascending: true });
  if (year !== 'all') query = query.gte('played_at', `${year}-01-01T00:00:00`).lte('played_at', `${year}-12-31T23:59:59`);
  const { data: matches } = await query;

  const historyEl = document.getElementById('match-history');
  if (!matches || matches.length === 0) { historyEl.innerHTML = '<p class="empty">No matches yet — log your first one! 🎾</p>'; return; }

  const getName = id => players.find(p => p.id === id)?.name || '?';
  const blocks = [];
  for (let i = 0; i < matches.length; i += 6) blocks.push(matches.slice(i, i + 6));
  const totalBlocks = blocks.length;
  blocks.reverse();

  historyEl.innerHTML = blocks.map((block, bi) => {
    const blockNumber = totalBlocks - bi;
    return `<div class="match-block">
      <div class="match-block-header">Match ${blockNumber}</div>
      ${block.map(m => {
        const sets = (m.match_blocks || []).sort((a, b) => a.block_number - b.block_number);
        const setsStr = sets.map(s => `${s.team1_score}-${s.team2_score}`).join('  ');
        const date = new Date(m.played_at).toLocaleDateString('en-GB');
        const dfs = [
          { name: getName(m.team1_player1_id), df: m.t1p1_df },
          { name: getName(m.team1_player2_id), df: m.t1p2_df },
          { name: getName(m.team2_player1_id), df: m.t2p1_df },
          { name: getName(m.team2_player2_id), df: m.t2p2_df },
        ].filter(x => x.df > 0);
        const dfStr = dfs.length > 0 ? `⚡ ${dfs.map(x => `${x.name}: ${x.df}`).join(', ')}` : '';
        return `<div class="match-card">
          <div class="match-teams">
            <div class="team ${m.winner_team === 1 ? 'winner' : ''}">${getName(m.team1_player1_id)} & ${getName(m.team1_player2_id)}${m.winner_team === 1 ? ' <span class="win-badge">WIN</span>' : ''}</div>
            <div class="match-vs">vs</div>
            <div class="team ${m.winner_team === 2 ? 'winner' : ''}">${getName(m.team2_player1_id)} & ${getName(m.team2_player2_id)}${m.winner_team === 2 ? ' <span class="win-badge">WIN</span>' : ''}</div>
          </div>
          <div class="match-meta"><span class="match-sets">${setsStr}</span><span class="match-date">${date}</span></div>
          ${dfStr ? `<div class="match-df">${dfStr}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

/* ── Log Match Modal ── */
document.getElementById('log-match-btn').addEventListener('click', () => document.getElementById('modal-overlay').classList.remove('hidden'));
document.getElementById('modal-close').addEventListener('click', () => document.getElementById('modal-overlay').classList.add('hidden'));
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === document.getElementById('modal-overlay')) document.getElementById('modal-overlay').classList.add('hidden'); });

document.getElementById('match-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const t1p1 = document.getElementById('t1p1').value, t1p2 = document.getElementById('t1p2').value;
  const t2p1 = document.getElementById('t2p1').value, t2p2 = document.getElementById('t2p2').value;

  if (new Set([t1p1, t1p2, t2p1, t2p2]).size !== 4) { showMatchError('Each player can only appear once!'); return; }

  const s1t1 = +document.getElementById('s1t1').value, s1t2 = +document.getElementById('s1t2').value;
  const winner_team = s1t1 > s1t2 ? 1 : 2;
  const t1p1_df = +document.getElementById('df-t1p1').value || 0, t1p2_df = +document.getElementById('df-t1p2').value || 0;
  const t2p1_df = +document.getElementById('df-t2p1').value || 0, t2p2_df = +document.getElementById('df-t2p2').value || 0;

  const { data: matchData, error: matchError } = await db.from('matches').insert({
    team1_player1_id: t1p1, team1_player2_id: t1p2, team2_player1_id: t2p1, team2_player2_id: t2p2,
    winner_team, created_by: currentUser.id, t1p1_df, t1p2_df, t2p1_df, t2p2_df
  }).select().single();
  if (matchError) { showMatchError('Error saving match.'); return; }

  const { error: blocksError } = await db.from('match_blocks').insert([{ block_number: 1, team1_score: s1t1, team2_score: s1t2, match_id: matchData.id }]);
  if (blocksError) { showMatchError('Error saving score.'); return; }

  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('match-form').reset();
  await Promise.all([loadLeaderboard(leaderboardYear), loadMatchHistory(historyYear)]);
});

function showMatchError(msg) {
  const el = document.getElementById('match-error');
  el.textContent = msg; el.classList.remove('hidden');
}

init();
