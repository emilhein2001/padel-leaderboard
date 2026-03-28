let players = [];
let currentUser = null;
let leaderboardYear = 2026;
let historyYear = 2026;

async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  currentUser = session.user;

  const { data: playerData } = await db.from('players').select('name').eq('id', currentUser.id).single();
  if (playerData) document.getElementById('user-name').textContent = playerData.name;

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
  });
}

async function loadLeaderboard(year = 2026) {
  let query = db.from('matches').select('*');
  if (year !== 'all') {
    query = query
      .gte('played_at', `${year}-01-01T00:00:00`)
      .lte('played_at', `${year}-12-31T23:59:59`);
  }
  const { data: matches } = await query;

  const stats = {};
  players.forEach(p => { stats[p.id] = { name: p.name, played: 0, wins: 0, losses: 0 }; });

  (matches || []).forEach(match => {
    [match.team1_player1_id, match.team1_player2_id].forEach(pid => {
      if (!stats[pid]) return;
      stats[pid].played++;
      match.winner_team === 1 ? stats[pid].wins++ : stats[pid].losses++;
    });
    [match.team2_player1_id, match.team2_player2_id].forEach(pid => {
      if (!stats[pid]) return;
      stats[pid].played++;
      match.winner_team === 2 ? stats[pid].wins++ : stats[pid].losses++;
    });
  });

  const sorted = Object.values(stats).sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const medals = ['🥇', '🥈', '🥉'];

  document.getElementById('leaderboard').innerHTML = `
    <table class="leaderboard-table">
      <thead><tr><th>#</th><th>Player</th><th>Played</th><th>Wins</th><th>Losses</th><th>Win Rate</th></tr></thead>
      <tbody>
        ${sorted.map((p, i) => `
          <tr>
            <td class="rank">${medals[i] || i + 1}</td>
            <td class="player-name">${p.name}</td>
            <td>${p.played}</td>
            <td class="wins">${p.wins}</td>
            <td class="losses">${p.losses}</td>
            <td>${p.played > 0 ? Math.round((p.wins / p.played) * 100) + '%' : '-'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function loadMatchHistory(year = 2026) {
  let query = db
    .from('matches')
    .select('*, match_blocks(*)')
    .order('played_at', { ascending: false })
    .limit(20);

  if (year !== 'all') {
    query = query
      .gte('played_at', `${year}-01-01T00:00:00`)
      .lte('played_at', `${year}-12-31T23:59:59`);
  }

  const { data: matches } = await query;
  const historyEl = document.getElementById('match-history');

  if (!matches || matches.length === 0) {
    historyEl.innerHTML = '<p class="empty">No matches yet — log your first one! 🎾</p>';
    return;
  }

  const getName = (id) => players.find(p => p.id === id)?.name || '?';

  historyEl.innerHTML = matches.map(m => {
    const sets = (m.match_blocks || []).sort((a, b) => a.block_number - b.block_number);
    const setsStr = sets.map(s => `${s.team1_score}-${s.team2_score}`).join('  ');
    const date = new Date(m.played_at).toLocaleDateString('en-GB');
    return `
      <div class="match-card">
        <div class="match-teams">
          <div class="team ${m.winner_team === 1 ? 'winner' : ''}">
            ${getName(m.team1_player1_id)} & ${getName(m.team1_player2_id)}
            ${m.winner_team === 1 ? '<span class="win-badge">WIN</span>' : ''}
          </div>
          <div class="match-vs">vs</div>
          <div class="team ${m.winner_team === 2 ? 'winner' : ''}">
            ${getName(m.team2_player1_id)} & ${getName(m.team2_player2_id)}
            ${m.winner_team === 2 ? '<span class="win-badge">WIN</span>' : ''}
          </div>
        </div>
        <div class="match-meta">
          <span class="match-sets">${setsStr}</span>
          <span class="match-date">${date}</span>
        </div>
      </div>`;
  }).join('');
}

// Modal
document.getElementById('log-match-btn').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.remove('hidden');
});
document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden');
});
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay'))
    document.getElementById('modal-overlay').classList.add('hidden');
});

document.getElementById('match-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const t1p1 = document.getElementById('t1p1').value;
  const t1p2 = document.getElementById('t1p2').value;
  const t2p1 = document.getElementById('t2p1').value;
  const t2p2 = document.getElementById('t2p2').value;

  if (new Set([t1p1, t1p2, t2p1, t2p2]).size !== 4) {
    showMatchError('Each player can only appear once per match!'); return;
  }

  const s1t1 = +document.getElementById('s1t1').value;
  const s1t2 = +document.getElementById('s1t2').value;
  const sets = [{ block_number: 1, team1_score: s1t1, team2_score: s1t2 }];
  const winner_team = s1t1 > s1t2 ? 1 : 2;

  const { data: matchData, error: matchError } = await db.from('matches').insert({
    team1_player1_id: t1p1, team1_player2_id: t1p2,
    team2_player1_id: t2p1, team2_player2_id: t2p2,
    winner_team, created_by: currentUser.id
  }).select().single();

  if (matchError) { showMatchError('Error saving match. Try again.'); return; }

  const { error: blocksError } = await db.from('match_blocks')
    .insert(sets.map(s => ({ ...s, match_id: matchData.id })));

  if (blocksError) { showMatchError('Error saving set scores. Try again.'); return; }

  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('match-form').reset();
  await loadLeaderboard(leaderboardYear);
  await loadMatchHistory(historyYear);
});

function showMatchError(msg) {
  const el = document.getElementById('match-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await db.auth.signOut();
  window.location.href = 'index.html';
});

init();
