let players = [];
let allMatches = [];

const PLAYER_META = {
  'Hein':   { emoji: '🎾', nickname: 'Hein' },
  'Lopper': { emoji: '🔥', nickname: 'Lopper' },
  'Lau':    { emoji: '⚡', nickname: 'Lau' },
  'Hoppe':  { emoji: '🎯', nickname: 'Hoppe' },
};

async function init() {
  const session = await initNav();
  if (!session) return;

  const [{ data: p }, { data: m }] = await Promise.all([
    db.from('players').select('*').order('name'),
    db.from('matches').select('*, match_blocks(*)').order('played_at', { ascending: true }),
  ]);
  players = p || [];
  allMatches = m || [];

  render();
}

function computeAllTimeStats(playerId) {
  let played = 0, wins = 0, points = 0, doubleFaults = 0;

  allMatches.forEach(match => {
    const t1s = match.match_blocks?.[0]?.team1_score || 0;
    const t2s = match.match_blocks?.[0]?.team2_score || 0;

    const isT1P1 = match.team1_player1_id === playerId;
    const isT1P2 = match.team1_player2_id === playerId;
    const isT2P1 = match.team2_player1_id === playerId;
    const isT2P2 = match.team2_player2_id === playerId;

    if (isT1P1 || isT1P2) {
      played++;
      points += t1s;
      if (match.winner_team === 1) wins++;
      if (isT1P1) doubleFaults += match.t1p1_df || 0;
      if (isT1P2) doubleFaults += match.t1p2_df || 0;
    } else if (isT2P1 || isT2P2) {
      played++;
      points += t2s;
      if (match.winner_team === 2) wins++;
      if (isT2P1) doubleFaults += match.t2p1_df || 0;
      if (isT2P2) doubleFaults += match.t2p2_df || 0;
    }
  });

  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;
  return { played, wins, points, doubleFaults, winRate };
}

function getBestPartner(playerId) {
  const partnerWins = {};

  allMatches.forEach(match => {
    let partnerId = null;
    let won = false;

    if (match.team1_player1_id === playerId) {
      partnerId = match.team1_player2_id;
      won = match.winner_team === 1;
    } else if (match.team1_player2_id === playerId) {
      partnerId = match.team1_player1_id;
      won = match.winner_team === 1;
    } else if (match.team2_player1_id === playerId) {
      partnerId = match.team2_player2_id;
      won = match.winner_team === 2;
    } else if (match.team2_player2_id === playerId) {
      partnerId = match.team2_player1_id;
      won = match.winner_team === 2;
    }

    if (partnerId) {
      if (!partnerWins[partnerId]) partnerWins[partnerId] = { games: 0, wins: 0 };
      partnerWins[partnerId].games++;
      if (won) partnerWins[partnerId].wins++;
    }
  });

  const entries = Object.entries(partnerWins);
  if (entries.length === 0) return null;
  const best = entries.sort(([, a], [, b]) => b.wins - a.wins || b.games - a.games)[0];
  const partner = players.find(p => p.id === best[0]);
  return partner ? { name: partner.name, wins: best[1].wins, games: best[1].games } : null;
}

function render() {
  if (players.length === 0) {
    document.getElementById('player-grid').innerHTML = '<p class="empty">No players found.</p>';
    return;
  }

  // Sort by all-time wins descending
  const sorted = players.map(p => ({ ...p, stats: computeAllTimeStats(p.id) }))
    .sort((a, b) => b.stats.wins - a.stats.wins);

  document.getElementById('player-grid').innerHTML = sorted.map((p, rank) => {
    const meta = PLAYER_META[p.name] || { emoji: '🎾', nickname: p.name };
    const s = p.stats;
    const bestPartner = getBestPartner(p.id);
    const rankLabel = ['🥇', '🥈', '🥉', '4️⃣'][rank] || `${rank + 1}`;

    return `
      <div class="player-card">
        <div class="player-card-header">
          <div class="player-avatar">${meta.emoji}</div>
          <div class="player-rank-badge">${rankLabel}</div>
        </div>
        <div class="player-card-name">${p.name}</div>
        <div class="player-card-nickname">${meta.nickname}</div>
        <div class="player-stats-grid">
          <div class="player-stat">
            <div class="player-stat-value">${s.played}</div>
            <div class="player-stat-label">Played</div>
          </div>
          <div class="player-stat">
            <div class="player-stat-value wins">${s.wins}</div>
            <div class="player-stat-label">Wins</div>
          </div>
          <div class="player-stat">
            <div class="player-stat-value">${s.winRate}%</div>
            <div class="player-stat-label">Win Rate</div>
          </div>
          <div class="player-stat">
            <div class="player-stat-value">${s.points}</div>
            <div class="player-stat-label">Points</div>
          </div>
        </div>
        ${bestPartner ? `
        <div class="player-partner">
          🤝 Best partner: <strong>${bestPartner.name}</strong>
          <span style="color:var(--muted);font-size:0.75rem;">(${bestPartner.wins}W in ${bestPartner.games} games)</span>
        </div>` : ''}
        ${s.doubleFaults > 0 ? `<div class="player-df">⚡ ${s.doubleFaults} double fault${s.doubleFaults > 1 ? 's' : ''} all-time</div>` : ''}
      </div>`;
  }).join('');
}

init();
