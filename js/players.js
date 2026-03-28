let players = [];
let allMatches = [];

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

function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const STATS_YEAR = new Date().getFullYear();

function computeCurrentYearStats(playerId) {
  let played = 0, wins = 0, points = 0, doubleFaults = 0;
  allMatches.filter(m => new Date(m.played_at).getFullYear() === STATS_YEAR).forEach(match => {
    const t1s = match.match_blocks?.[0]?.team1_score || 0;
    const t2s = match.match_blocks?.[0]?.team2_score || 0;
    const isT1P1 = match.team1_player1_id === playerId;
    const isT1P2 = match.team1_player2_id === playerId;
    const isT2P1 = match.team2_player1_id === playerId;
    const isT2P2 = match.team2_player2_id === playerId;
    if (isT1P1 || isT1P2) {
      played++; points += t1s;
      if (match.winner_team === 1) wins++;
      if (isT1P1) doubleFaults += match.t1p1_df || 0;
      if (isT1P2) doubleFaults += match.t1p2_df || 0;
    } else if (isT2P1 || isT2P2) {
      played++; points += t2s;
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
    let partnerId = null, won = false;
    if (match.team1_player1_id === playerId) { partnerId = match.team1_player2_id; won = match.winner_team === 1; }
    else if (match.team1_player2_id === playerId) { partnerId = match.team1_player1_id; won = match.winner_team === 1; }
    else if (match.team2_player1_id === playerId) { partnerId = match.team2_player2_id; won = match.winner_team === 2; }
    else if (match.team2_player2_id === playerId) { partnerId = match.team2_player1_id; won = match.winner_team === 2; }
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

const avatarSVG = `<svg class="player-avatar-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="50" fill="#1e293b"/>
  <circle cx="50" cy="36" r="20" fill="#475569"/>
  <ellipse cx="50" cy="90" rx="30" ry="24" fill="#475569"/>
</svg>`;

function render() {
  if (players.length === 0) {
    document.getElementById('player-grid').innerHTML = '<p class="empty">No players found.</p>';
    return;
  }

  const sorted = players
    .map(p => ({ ...p, stats: computeCurrentYearStats(p.id) }))
    .sort((a, b) => b.stats.wins - a.stats.wins);

  document.getElementById('player-grid').innerHTML = sorted.map((p, rank) => {
    const s = p.stats;
    const age = calcAge(p.birth_date);
    const bestPartner = getBestPartner(p.id);
    const infoRows = [
      p.full_name ? ['Full name', p.full_name] : null,
      (p.gender && age) ? ['Info', `${p.gender}, ${age} years old`] : (age ? ['Age', `${age} years old`] : null),
      p.playing_side ? ['Playing side', p.playing_side] : null,
      p.racket ? ['Racket', p.racket] : null,
    ].filter(Boolean);

    return `
      <div class="player-card">
        <div class="player-card-header">
          ${avatarSVG}
        </div>
        <div class="player-card-name">${p.name}</div>
        ${p.full_name ? `<div class="player-card-nickname">${p.full_name}</div>` : ''}
        <div class="player-stats-year">${STATS_YEAR} Season</div>
        <div class="player-stats-grid">
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
          <div class="player-stat">
            <div class="player-stat-value">${s.played}</div>
            <div class="player-stat-label">Played</div>
          </div>
        </div>
        ${infoRows.length > 0 ? `
        <div class="player-info-table">
          ${infoRows.map(([label, value]) => `
            <div class="player-info-row">
              <span class="player-info-label">${label}</span>
              <span class="player-info-value">${value}</span>
            </div>`).join('')}
        </div>` : ''}
        ${bestPartner ? `
        <div class="player-partner">
          🤝 Best partner: <strong>${bestPartner.name}</strong>
          <span style="color:var(--muted);font-size:0.75rem;">(${bestPartner.wins}W / ${bestPartner.games} games)</span>
        </div>` : ''}
      </div>`;
  }).join('');
}

init();
