async function initNav() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return null; }

  const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
  const links = [
    { href: 'dashboard.html', icon: '🏠', label: 'Home' },
    { href: 'leaderboard.html', icon: '🏆', label: 'Leaderboard' },
    { href: 'beers.html', icon: '🍺', label: 'Beers' },
    { href: 'stats.html', icon: '📊', label: 'Stats' },
    { href: 'players.html', icon: '👥', label: 'Players' },
  ];

  document.getElementById('nav-placeholder').innerHTML = `
    <header class="main-nav">
      <div class="nav-inner">
        <div class="nav-logo">🎾 Padel</div>
        <nav class="nav-links">
          ${links.map(l => `
            <a href="${l.href}" class="nav-link ${currentPage === l.href ? 'active' : ''}">
              <span class="nav-icon">${l.icon}</span>
              <span class="nav-label">${l.label}</span>
            </a>`).join('')}
        </nav>
        <div class="nav-user">
          <span id="nav-user-name"></span>
          <button id="nav-logout" class="btn btn-outline btn-sm">Logout</button>
        </div>
      </div>
    </header>`;

  const { data: playerData } = await db.from('players').select('name').eq('id', session.user.id).single();
  if (playerData) document.getElementById('nav-user-name').textContent = playerData.name;

  document.getElementById('nav-logout').addEventListener('click', async () => {
    await db.auth.signOut();
    window.location.href = 'index.html';
  });

  return session;
}
