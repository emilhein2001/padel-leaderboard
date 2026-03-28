let players = [];
let allMatches = [];
let currentYear = 2026;
let charts = {};

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899'];

async function init() {
  const session = await initNav();
  if (!session) return;

  const { data } = await db.from('players').select('*').order('name');
  players = data || [];

  const { data: matches } = await db.from('matches').select('*, match_blocks(*)').order('played_at', { ascending: true });
  allMatches = matches || [];

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

function render() {
  const matches = getFilteredMatches();
  renderTable(matches);
  renderChart(matches);
}

function computeStats(matches) {
  const stats = {};
  players.forEach(p => { stats[p.id] = { name: p.name, played: 0, wins: 0, losses: 0, points: 0, doubleFaults: 0 }; });

  matches.forEach(match => {
    const t1s = match.match_blocks?.[0]?.team1_score || 0;
    const t2s = match.match_blocks?.[0]?.team2_score || 0;

    [{ id: match.team1_player1_id, df: match.t1p1_df || 0 }, { id: match.team1_player2_id, df: match.t1p2_df || 0 }].forEach(({ id, df }) => {
      if (!stats[id]) return;
      stats[id].played++; stats[id].points += t1s; stats[id].doubleFaults += df;
      match.winner_team === 1 ? stats[id].wins++ : stats[id].losses++;
    });
    [{ id: match.team2_player1_id, df: match.t2p1_df || 0 }, { id: match.team2_player2_id, df: match.t2p2_df || 0 }].forEach(({ id, df }) => {
      if (!stats[id]) return;
      stats[id].played++; stats[id].points += t2s; stats[id].doubleFaults += df;
      match.winner_team === 2 ? stats[id].wins++ : stats[id].losses++;
    });
  });

  return Object.values(stats).sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.doubleFaults - b.doubleFaults);
}

function renderTable(matches) {
  const sorted = computeStats(matches);
  document.getElementById('leaderboard-table').innerHTML = `
    <table class="leaderboard-table">
      <thead><tr><th>#</th><th>Player</th><th>Played</th><th>Wins</th><th>Losses</th><th>Win Rate</th><th>Points</th><th>DF</th></tr></thead>
      <tbody>
        ${sorted.map((p, i) => `
          <tr>
            <td class="rank">${i + 1}</td>
            <td class="player-name">${p.name}</td>
            <td>${p.played}</td>
            <td class="wins">${p.wins}</td>
            <td class="losses">${p.losses}</td>
            <td>${p.played > 0 ? Math.round((p.wins / p.played) * 100) + '%' : '-'}</td>
            <td>${p.points}</td>
            <td class="df-count">${p.doubleFaults}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderChart(matches) {
  const blocks = [];
  for (let i = 0; i < matches.length; i += 6) blocks.push(matches.slice(i, i + 6));
  const blockLabels = blocks.map((_, i) => `Match ${i + 1}`);

  // Cumulative wins per block
  const cumWins = {};
  players.forEach(p => cumWins[p.id] = []);
  const running = {};
  players.forEach(p => running[p.id] = 0);

  blocks.forEach(block => {
    block.forEach(match => {
      [match.team1_player1_id, match.team1_player2_id].forEach(id => { if (match.winner_team === 1 && running[id] !== undefined) running[id]++; });
      [match.team2_player1_id, match.team2_player2_id].forEach(id => { if (match.winner_team === 2 && running[id] !== undefined) running[id]++; });
    });
    players.forEach(p => cumWins[p.id].push(running[p.id]));
  });

  destroyCharts();

  charts.wins = new Chart(document.getElementById('chart-wins'), {
    type: 'line',
    data: {
      labels: blockLabels,
      datasets: players.map((p, i) => ({
        label: p.name,
        data: cumWins[p.id],
        borderColor: COLORS[i % COLORS.length],
        backgroundColor: COLORS[i % COLORS.length] + '20',
        tension: 0.3,
        fill: false,
        pointRadius: 5,
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#f1f5f9', font: { size: 12 } } } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#334155' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#334155' }, beginAtZero: true }
      }
    }
  });
}

function destroyCharts() {
  Object.values(charts).forEach(c => c.destroy());
  charts = {};
}

init();
