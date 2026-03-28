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

  document.getElementById('year-filter').addEventListener('click', async (e) => {
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
  renderCharts(matches);
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

function renderCharts(matches) {
  // Group into blocks of 6
  const blocks = [];
  for (let i = 0; i < matches.length; i += 6) blocks.push(matches.slice(i, i + 6));
  const blockLabels = blocks.map((_, i) => `Match ${i + 1}`);

  // Cumulative wins per block
  const cumWins = {};
  players.forEach(p => cumWins[p.id] = []);
  let running = {};
  players.forEach(p => running[p.id] = 0);

  blocks.forEach(block => {
    block.forEach(match => {
      [match.team1_player1_id, match.team1_player2_id].forEach(id => { if (match.winner_team === 1 && running[id] !== undefined) running[id]++; });
      [match.team2_player1_id, match.team2_player2_id].forEach(id => { if (match.winner_team === 2 && running[id] !== undefined) running[id]++; });
    });
    players.forEach(p => cumWins[p.id].push(running[p.id]));
  });

  // Points per block
  const pointsPerBlock = {};
  players.forEach(p => pointsPerBlock[p.id] = []);
  blocks.forEach(block => {
    const blockPts = {};
    players.forEach(p => blockPts[p.id] = 0);
    block.forEach(match => {
      const t1s = match.match_blocks?.[0]?.team1_score || 0;
      const t2s = match.match_blocks?.[0]?.team2_score || 0;
      [match.team1_player1_id, match.team1_player2_id].forEach(id => { if (blockPts[id] !== undefined) blockPts[id] += t1s; });
      [match.team2_player1_id, match.team2_player2_id].forEach(id => { if (blockPts[id] !== undefined) blockPts[id] += t2s; });
    });
    players.forEach(p => pointsPerBlock[p.id].push(blockPts[p.id]));
  });

  const stats = computeStats(matches);

  destroyCharts();

  // Chart 1: Cumulative wins
  charts.wins = new Chart(document.getElementById('chart-wins'), {
    type: 'line',
    data: {
      labels: blockLabels,
      datasets: players.map((p, i) => ({
        label: p.name,
        data: cumWins[p.id],
        borderColor: COLORS[i],
        backgroundColor: COLORS[i] + '20',
        tension: 0.3,
        fill: false,
        pointRadius: 5,
      }))
    },
    options: chartOptions('Wins')
  });

  // Chart 2: Win rate bar
  charts.winrate = new Chart(document.getElementById('chart-winrate'), {
    type: 'bar',
    data: {
      labels: stats.map(p => p.name),
      datasets: [{
        label: 'Win Rate %',
        data: stats.map(p => p.played > 0 ? Math.round((p.wins / p.played) * 100) : 0),
        backgroundColor: players.map((_, i) => COLORS[i % COLORS.length] + 'cc'),
        borderRadius: 6,
      }]
    },
    options: chartOptions('%', true)
  });

  // Chart 3: Points per block
  charts.points = new Chart(document.getElementById('chart-points'), {
    type: 'bar',
    data: {
      labels: blockLabels,
      datasets: players.map((p, i) => ({
        label: p.name,
        data: pointsPerBlock[p.id],
        backgroundColor: COLORS[i] + 'cc',
        borderRadius: 4,
      }))
    },
    options: { ...chartOptions('Points'), plugins: { ...chartOptions('Points').plugins }, scales: { x: { stacked: false, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } }
  });

  // Chart 4: Double faults
  charts.df = new Chart(document.getElementById('chart-df'), {
    type: 'doughnut',
    data: {
      labels: stats.map(p => p.name),
      datasets: [{
        data: stats.map(p => p.doubleFaults),
        backgroundColor: players.map((_, i) => COLORS[i % COLORS.length] + 'cc'),
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#f1f5f9', font: { size: 12 } } } }
    }
  });
}

function chartOptions(yLabel, horizontal = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#f1f5f9', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#334155' }, beginAtZero: true }
    }
  };
}

function destroyCharts() {
  Object.values(charts).forEach(c => c.destroy());
  charts = {};
}

init();
