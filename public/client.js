const loginTab = document.getElementById('loginTab');
const signupTab = document.getElementById('signupTab');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const loginError = document.getElementById('loginError');
const signupError = document.getElementById('signupError');

loginTab.addEventListener('click', () => {
  loginTab.classList.add('active');
  signupTab.classList.remove('active');
  loginForm.classList.remove('hidden');
  signupForm.classList.add('hidden');
});

signupTab.addEventListener('click', () => {
  signupTab.classList.add('active');
  loginTab.classList.remove('active');
  signupForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = 'chat.html';  // 👈 redirect to chat page
    } else {
      loginError.textContent = data.error;
    }
  } catch (err) {
    loginError.textContent = 'Something went wrong';
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('signupUsername').value;
  const password = document.getElementById('signupPassword').value;
  const dpFile = document.getElementById('dpInput').files[0];
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  if (dpFile) formData.append('dp', dpFile);

  try {
    const res = await fetch('/signup', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = 'chat.html';  // 👈 redirect to chat page
    } else {
      signupError.textContent = data.error;
    }
  } catch (err) {
    signupError.textContent = 'Something went wrong';
  }
});