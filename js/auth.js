db.auth.getSession().then(({ data: { session } }) => {
  if (session) window.location.href = 'dashboard.html';
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const btn = document.getElementById('login-btn');
  const errorMsg = document.getElementById('error-msg');

  btn.textContent = 'Signing in...';
  btn.disabled = true;
  errorMsg.classList.add('hidden');

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    errorMsg.textContent = 'Invalid email or password';
    errorMsg.classList.remove('hidden');
    btn.textContent = 'Sign In';
    btn.disabled = false;
  } else {
    window.location.href = 'dashboard.html';
  }
});
