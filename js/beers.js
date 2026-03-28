let players = [];
let allMatches = [];
let tiebreakers = [];
let beerRounds = [];
let currentUser = null;
let currentYear = 2026;
let pendingTiebreakBlock = null;

async function init() {
  const session = await initNav();
  if (!session) return;
  currentUser = session.user;

  const [{ data: p }, { data: m }, { data: t }, { data: br }] = await Promise.all([
    db.from('players').select('*').order('name'),
    db.from('matches').select('*, match_blocks(*)').order('played_at', { ascending: true }),
    db.from('block_tiebreakers').select('*'),
    db.from('beer_rounds').select('*').order('paid_at', { ascending: false }),
  ]);

  players = p || [];
  allMatches = m || [];
  tiebreakers = t || [];
  beerRounds = br || [];

  // Populate beer player dropdown
  const sel = document.getElementById('beer-player');
  players.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    sel.appendChild(opt);
  });

  // Set default date to today
  document.getElementById('beer-date').value = new Date().toISOString().split('T')[0];

  document.getElementById('year-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#year-filter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentYear = btn.dataset.year === 'all' ? 'all' : +btn.dataset.year;
    render();
  });

  document.getElementById('log-beer-btn').addEventListener('click', () => document.getElementById('beer-modal').classList.remove('hidden'));
  document.getElementById('beer-modal-close').addEventListener('click', () => document.getElementById('beer-modal').classList.add('hidden'));
  document.getElementById('tiebreak-modal-close').addEventListener('click', () => document.getElementById('tiebreak-modal').classList.add('hidden'));

  document.getElementById('beer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const player_id = document.getElementById('beer-player').value;
    const paid_at = document.getElementById('beer-date').value;
    const location = document.getElementById('beer-location').value;
    const year = new Date(paid_at).getFullYear();

    const { error } = await db.from('beer_rounds').insert({ player_id, paid_at, location, year, logged_by: currentUser.id });
    if (error) { alert('Error saving. Try again.'); return; }

    const { data: br } = await db.from('beer_rounds').select('*').order('paid_at', { ascending: false });
    beerRounds = br || [];
    document.getElementById('beer-modal').classList.add('hidden');
    document.getElementById('beer-form').reset();
    document.getElementById('beer-date').value = new Date().toISOString().split('T')[0];
    render();
  });

  document.getElementById('tiebreak-save').addEventListener('click', async () => {
    const beer_player_id = document.getElementById('tiebreak-loser').value;
    if (!beer_player_id || !pendingTiebreakBlock) return;

    const { error } = await db.from('block_tiebreakers').insert({
      block_number: pendingTiebreakBlock.blockNumber,
      year: pendingTiebreakBlock.year,
      beer_player_id
    });
    if (error) { alert('Error saving tiebreaker.'); return; }

    const { data: t } = await db.from('block_tiebreakers').select('*');
    tiebreakers = t || [];
    document.getElementById('tiebreak-modal').classList.add('hidden');
    pendingTiebreakBlock = null;
    render();
  });

  render();
}

function getFilteredMatches() {
  if (currentYear === 'all') return allMatches;
  return allMatches.filter(m => new Date(m.played_at).getFullYear() === currentYear);
}

function getFilteredRounds() {
  if (currentYear === 'all') return beerRounds;
  return beerRounds.filter(r => r.year === currentYear);
}

function getBlockStats(block) {
  const stats = {};
  players.forEach(p => { stats[p.id] = { wins: 0, points: 0, dfs: 0 }; });

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
      if (won) stats[id].wins++;
      stats[id].points += score;
      stats[id].dfs += df;
    });
  });

  return stats;
}

function rankBlock(stats) {
  return Object.entries(stats)
    .filter(([, s]) => s.wins > 0 || s.points > 0)
    .sort(([, a], [, b]) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.points !== a.points) return b.points - a.points;
      return a.dfs - b.dfs;
    });
}

function render() {
  const matches = getFilteredMatches();
  const rounds = getFilteredRounds();

  // Build blocks
  const blocks = [];
  for (let i = 0; i < matches.length; i += 6) blocks.push(matches.slice(i, i + 6));

  // Determine beer year for tiebreaker lookup
  const beerYear = currentYear === 'all' ? null : currentYear;

  // Calculate beers owed per player
  const beersOwed = {};
  players.forEach(p => { beersOwed[p.id] = 0; });

  const blockResults = blocks.map((block, bi) => {
    const blockNumber = bi + 1;
    const blockYear = block[0] ? new Date(block[0].played_at).getFullYear() : currentYear;
    const stats = getBlockStats(block);
    const ranked = rankBlock(stats);
    if (ranked.length === 0) return null;

    const last = ranked[ranked.length - 1];
    const secondLast = ranked[ranked.length - 2];

    const isShuffleTie = secondLast &&
      last[1].wins === secondLast[1].wins &&
      last[1].points === secondLast[1].points &&
      last[1].dfs === secondLast[1].dfs;

    const tiebreaker = tiebreakers.find(t => t.block_number === blockNumber && t.year === blockYear);

    let beerPlayerId = null;
    let status = 'clear';

    if (isShuffleTie) {
      if (tiebreaker) {
        beerPlayerId = tiebreaker.beer_player_id;
        status = 'resolved';
      } else {
        status = 'needs-tiebreak';
        // Pass tied player IDs
        return { blockNumber, blockYear, ranked, beerPlayerId: null, status, tiedIds: [last[0], secondLast[0]], stats };
      }
    } else {
      beerPlayerId = last[0];
    }

    if (beerPlayerId && beersOwed[beerPlayerId] !== undefined) beersOwed[beerPlayerId]++;

    return { blockNumber, blockYear, ranked, beerPlayerId, status, stats };
  }).filter(Boolean);

  // Beer rounds paid per player
  const beersPaid = {};
  players.forEach(p => { beersPaid[p.id] = 0; });
  rounds.forEach(r => { if (beersPaid[r.player_id] !== undefined) beersPaid[r.player_id]++; });

  // Render summary cards
  const getName = id => players.find(p => p.id === id)?.name || '?';

  document.getElementById('beer-summary').innerHTML = players.map(p => {
    const owed = beersOwed[p.id] || 0;
    const paid = beersPaid[p.id] || 0;
    const balance = owed - paid;
    const cls = balance > 0 ? 'in-debt' : balance < 0 ? 'in-credit' : 'even';
    const balCls = balance > 0 ? 'balance-negative' : 'balance-zero';
    const balText = balance > 0 ? `${balance} beer${balance > 1 ? 's' : ''} behind` : balance < 0 ? `${Math.abs(balance)} ahead` : 'All square!';
    return `
      <div class="beer-card ${cls}">
        <div class="beer-name">${p.name}</div>
        <div class="beer-owed">${owed} 🍺</div>
        <div class="beer-meta">${paid} paid</div>
        <div class="beer-balance ${balCls}">${balText}</div>
      </div>`;
  }).join('');

  // Render block results
  if (blockResults.length === 0) {
    document.getElementById('block-results').innerHTML = '<p class="empty">No blocks yet.</p>';
  } else {
    document.getElementById('block-results').innerHTML = [...blockResults].reverse().map(b => {
      let loserHTML = '';
      if (b.status === 'needs-tiebreak') {
        const names = b.tiedIds.map(id => getName(id)).join(' vs ');
        loserHTML = `<span class="block-result-loser needs-tiebreak">⚠️ Tie: ${names}</span>
          <button class="btn btn-outline tiebreak-btn" onclick="openTiebreak(${b.blockNumber}, ${b.blockYear}, ${JSON.stringify(b.tiedIds)})">Resolve 🎯</button>`;
      } else {
        const name = getName(b.beerPlayerId);
        loserHTML = `<span class="block-result-loser resolved">🍺 ${name} owes a beer</span>`;
      }

      // Show mini rankings
      const rankStr = b.ranked.map(([id, s]) => `${getName(id)}: ${s.wins}W ${s.points}pts`).join(' · ');

      return `
        <div class="block-result">
          <div>
            <div class="block-result-label">Match ${b.blockNumber} · ${b.blockYear}</div>
            <div style="font-size:0.75rem;color:var(--muted);margin-top:0.25rem;">${rankStr}</div>
          </div>
          <div style="display:flex;align-items:center;gap:0.75rem;">${loserHTML}</div>
        </div>`;
    }).join('');
  }

  // Render payment log
  if (rounds.length === 0) {
    document.getElementById('payment-log').innerHTML = '<p class="empty">No rounds logged yet.</p>';
  } else {
    document.getElementById('payment-log').innerHTML = rounds.map(r => {
      const name = getName(r.player_id);
      const date = new Date(r.paid_at).toLocaleDateString('en-GB');
      return `
        <div class="payment-item">
          <div>
            <div class="payment-who">🍺 ${name}</div>
            <div class="payment-meta">${date}</div>
          </div>
          <div class="payment-location">📍 ${r.location || '—'}</div>
        </div>`;
    }).join('');
  }
}

function openTiebreak(blockNumber, blockYear, tiedIds) {
  pendingTiebreakBlock = { blockNumber, blockYear };
  const getName = id => players.find(p => p.id === id)?.name || '?';
  document.getElementById('tiebreak-desc').textContent =
    `Match ${blockNumber} ended in a tie between ${tiedIds.map(getName).join(' and ')} on wins, points, and double faults. Who lost the shuffleboard game?`;
  const sel = document.getElementById('tiebreak-loser');
  sel.innerHTML = tiedIds.map(id => `<option value="${id}">${getName(id)}</option>`).join('');
  document.getElementById('tiebreak-modal').classList.remove('hidden');
}

init();
