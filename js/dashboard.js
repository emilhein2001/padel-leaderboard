let players = [];
let currentUser = null;
let leaderboardYear = 2026;
let historyYear = 2026;

async function init() {
  const session = await initNav();
  if (!session) return;
  currentUser = session.user;

  await loadPlayers();
  await loadLeaderboard(leaderboardYear);
  await loadMatchHistory(historyYear);
  setupFilters();
}

function setupFilters() {
  document.getElementById('leaderboard-filter').addEventListener('click', async (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#leaderboard-filter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    leaderboardYear = btn.dataset.year === 'all' ? 'all' : +btn.dataset.year;
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
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', updateDFLabels);
  });
}

async function loadLeaderboard(year = 2026) {
  let query = db.from('matches').select('*');
  if (year !== 'all') query = query.gte('played_at', `${year}-01-01T00:00:00`).lte('played_at', `${year}-12-31T23:59:59`);
  const { data: matches } = await query;

  const stats = {};
  players.forEach(p => { stats[p.id] = { name: p.name, played: 0, wins: 0, losses: 0, doubleFaults: 0 }; });

  (matches || []).forEach(match => {
    [{ id: match.team1_player1_id, df: match.t1p1_df || 0 }, { id: match.team1_player2_id, df: match.t1p2_df || 0 }].forEach(({ id, df }) => {
      if (!stats[id]) return;
      stats[id].played++; stats[id].doubleFaults += df;
      match.winner_team === 1 ? stats[id].wins++ : stats[id].losses++;
    });
    [{ id: match.team2_player1_id, df: match.t2p1_df || 0 }, { id: match.team2_player2_id, df: match.t2p2_df || 0 }].forEach(({ id, df }) => {
      if (!stats[id]) return;
      stats[id].played++; stats[id].doubleFaults += df;
      match.winner_team === 2 ? stats[id].wins++ : stats[id].losses++;
    });
  });

  const sorted = Object.values(stats).sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.doubleFaults - b.doubleFaults);

  document.getElementById('leaderboard').innerHTML = `
    <table class="leaderboard-table">
      <thead><tr><th>#</th><th>Player</th><th>Played</th><th>Wins</th><th>Win Rate</th><th>DF</th></tr></thead>
      <tbody>
        ${sorted.map((p, i) => `
          <tr>
            <td class="rank">${i + 1}</td>
            <td class="player-name">${p.name}</td>
            <td>${p.played}</td>
            <td class="wins">${p.wins}</td>
            <td>${p.played > 0 ? Math.round((p.wins / p.played) * 100) + '%' : '-'}</td>
            <td class="df-count">${p.doubleFaults}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function loadMatchHistory(year = 2026) {
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

// Modal
document.getElementById('log-match-btn').addEventListener('click', () => document.getElementById('modal-overlay').classList.remove('hidden'));
document.getElementById('modal-close').addEventListener('click', () => document.getElementById('modal-overlay').classList.add('hidden'));
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === document.getElementById('modal-overlay')) document.getElementById('modal-overlay').classList.add('hidden'); });

document.getElementById('match-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const t1p1 = document.getElementById('t1p1').value, t1p2 = document.getElementById('t1p2').value;
  const t2p1 = document.getElementById('t2p1').value, t2p2 = document.getElementById('t2p2').value;

  if (new Set([t1p1, t1p2, t2p1, t2p2]).size !== 4) { showMatchError('Each player can only appear once!'); return; }

  const s1t1 = +document.getElementById('s1t1').value, s1t2 = +document.getElementById('s1t2').value;
  const sets = [{ block_number: 1, team1_score: s1t1, team2_score: s1t2 }];
  const winner_team = s1t1 > s1t2 ? 1 : 2;
  const t1p1_df = +document.getElementById('df-t1p1').value || 0, t1p2_df = +document.getElementById('df-t1p2').value || 0;
  const t2p1_df = +document.getElementById('df-t2p1').value || 0, t2p2_df = +document.getElementById('df-t2p2').value || 0;

  const { data: matchData, error: matchError } = await db.from('matches').insert({
    team1_player1_id: t1p1, team1_player2_id: t1p2, team2_player1_id: t2p1, team2_player2_id: t2p2,
    winner_team, created_by: currentUser.id, t1p1_df, t1p2_df, t2p1_df, t2p2_df
  }).select().single();
  if (matchError) { showMatchError('Error saving match.'); return; }

  const { error: blocksError } = await db.from('match_blocks').insert(sets.map(s => ({ ...s, match_id: matchData.id })));
  if (blocksError) { showMatchError('Error saving score.'); return; }

  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('match-form').reset();
  await loadLeaderboard(leaderboardYear);
  await loadMatchHistory(historyYear);
});

function showMatchError(msg) {
  const el = document.getElementById('match-error');
  el.textContent = msg; el.classList.remove('hidden');
}

init();
