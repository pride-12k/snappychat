const user = JSON.parse(localStorage.getItem('user'));
if (!user) window.location.href = 'index.html';

const socket = io();

// DOM elements
const currentUserSpan = document.getElementById('currentUser');
const searchInput = document.getElementById('searchInput');
const userList = document.getElementById('userList');
const chatHeader = document.getElementById('chatHeader');
const chatPartnerDp = document.getElementById('chatPartnerDp');
const chatPartnerName = document.getElementById('chatPartnerName');
const messagesDiv = document.getElementById('messages');
const chatInputContainer = document.getElementById('chatInputContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const emptyChat = document.querySelector('.empty-chat');
const ytSyncBtn = document.getElementById('ytSyncBtn');

// Snap elements
const snapBtn = document.getElementById('snapBtn');
const snapModal = document.getElementById('snapModal');
const snapPreviewImg = document.getElementById('snapPreviewImg');
const snapFileInput = document.getElementById('snapFileInput');
const sendSnapBtn = document.getElementById('sendSnapBtn');
const closeSnapBtn = document.getElementById('closeSnapBtn');
const filterButtons = document.querySelectorAll('.filter-buttons button');

// GIF elements
const gifBtn = document.getElementById('gifBtn');
const gifModal = document.getElementById('gifModal');
const gifSearchInput = document.getElementById('gifSearchInput');
const gifResults = document.getElementById('gifResults');
const closeGifBtn = document.getElementById('closeGifBtn');

// YT elements
const ytPanel = document.getElementById('ytPanel');
const closeYtPanel = document.getElementById('closeYtPanel');
const ytVideoInput = document.getElementById('ytVideoInput');
const ytLoadBtn = document.getElementById('ytLoadBtn');
const ytPlayerContainer = document.getElementById('ytPlayerContainer');

let currentChatUserId = null;
let ytPlayer = null;
let ytReady = false;
let ytCurrentVideoId = null;

currentUserSpan.textContent = user.username;
socket.emit('join', user.id);

// ---------- Users ----------
function loadUsers(filter = '') {
  fetch('/search?q=' + encodeURIComponent(filter))
    .then(res => res.json())
    .then(users => {
      userList.innerHTML = '';
      users.forEach(u => {
        if (u.id === user.id) return;
        const li = document.createElement('li');
        li.innerHTML = `<img src="${u.dp}" alt="${u.username}"><span>${u.username}</span><span class="online-dot"></span>`;
        li.addEventListener('click', () => openChat(u));
        li.dataset.userId = u.id;
        userList.appendChild(li);
      });
    });
}
loadUsers();
searchInput.addEventListener('input', () => loadUsers(searchInput.value));

// ---------- Open Chat ----------
function openChat(partner) {
  currentChatUserId = partner.id;
  chatPartnerDp.src = partner.dp;
  chatPartnerName.textContent = partner.username;
  chatHeader.classList.remove('hidden');
  chatInputContainer.classList.remove('hidden');
  emptyChat.style.display = 'none';
  ytSyncBtn.style.display = 'inline-block';
  messagesDiv.innerHTML = '';
  ytPanel.classList.add('hidden');
  socket.emit('get-conversation', partner.id);
}

// ---------- Messages ----------
socket.on('conversation-history', (msgs) => {
  messagesDiv.innerHTML = '';
  msgs.forEach(m => displayMessage(m, false));
  scrollToBottom();
});

socket.on('chat-message', (msg) => {
  if (currentChatUserId && (msg.from === currentChatUserId || msg.to === currentChatUserId)) {
    displayMessage(msg, true);
  }
});

function displayMessage(msg, animate) {
  const div = document.createElement('div');
  div.classList.add('message');
  div.classList.add(msg.from === user.id ? 'sent' : 'received');
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

  let content = '';
  if (msg.type === 'snap') {
    content = `<img src="${msg.mediaUrl}" alt="snap" loading="lazy"><div class="time">${time}</div>`;
  } else if (msg.type === 'gif') {
    content = `<img src="${msg.mediaUrl}" class="gif-img" alt="gif"><div class="time">${time}</div>`;
  } else if (msg.type === 'instagram') {
    content = `<div class="insta-reel">${msg.text}</div><div class="time">${time}</div>`;
  } else {
    content = `${msg.text}<div class="time">${time}</div>`;
  }
  div.innerHTML = content;
  if (animate) { div.style.opacity = 0; setTimeout(() => div.style.opacity = 1, 10); }
  messagesDiv.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() { messagesDiv.scrollTop = messagesDiv.scrollHeight; }

// ---------- Send text / insta link ----------
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentChatUserId) return;

  // Check if Instagram reel link
  const instaRegex = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[a-zA-Z0-9_-]+/i;
  if (instaRegex.test(text)) {
    const embedHtml = `<iframe src="${text}embed/" width="100%" height="500" frameborder="0" scrolling="no" allowtransparency="true"></iframe>`;
    socket.emit('private-message', { to: currentChatUserId, text: embedHtml, type: 'instagram' });
  } else {
    socket.emit('private-message', { to: currentChatUserId, text, type: 'text' });
  }
  messageInput.value = '';
  messageInput.focus();
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

// ---------- SNAP (Photo with filters) ----------
snapBtn.addEventListener('click', () => {
  snapModal.classList.remove('hidden');
  snapFileInput.click();
});

snapFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      snapPreviewImg.src = ev.target.result;
      snapPreviewImg.style.filter = 'none';
    };
    reader.readAsDataURL(file);
  }
});

filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    snapPreviewImg.style.filter = btn.dataset.filter;
  });
});

closeSnapBtn.addEventListener('click', () => snapModal.classList.add('hidden'));

sendSnapBtn.addEventListener('click', async () => {
  if (!snapPreviewImg.src || !currentChatUserId) return;
  // Apply filter to canvas before upload
  const canvas = document.getElementById('snapCanvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = snapPreviewImg.src;
  img.onload = async () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.filter = snapPreviewImg.style.filter || 'none';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
    const formData = new FormData();
    formData.append('snap', blob, 'snap.jpg');
    const resp = await fetch('/upload-snap', { method: 'POST', body: formData });
    const data = await resp.json();
    socket.emit('private-message', { to: currentChatUserId, text: '', type: 'snap', mediaUrl: data.url });
    snapModal.classList.add('hidden');
  };
});

// ---------- GIF (GIPHY) ----------
gifBtn.addEventListener('click', () => gifModal.classList.remove('hidden'));
closeGifBtn.addEventListener('click', () => gifModal.classList.add('hidden'));

let gifSearchTimeout;
gifSearchInput.addEventListener('input', () => {
  clearTimeout(gifSearchTimeout);
  gifSearchTimeout = setTimeout(searchGifs, 500);
});

async function searchGifs() {
  const q = gifSearchInput.value.trim();
  if (!q) return;
  // Using GIPHY public API (no key needed for embed; but we fetch via serverless proxy)
  // For simplicity, use a hardcoded small set or we can use the embed iFrame approach
  // Let's use free Tenor/Giphy embed approach? 
  // Better: fetch from Giphy with a demo key (dc6zaTOxFJmzC - public beta key)
  try {
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(q)}&limit=12`);
    const json = await res.json();
    gifResults.innerHTML = '';
    json.data.forEach(gif => {
      const img = document.createElement('img');
      img.src = gif.images.fixed_height_small.url;
      img.addEventListener('click', () => {
        socket.emit('private-message', { to: currentChatUserId, text: '', type: 'gif', mediaUrl: gif.images.fixed_height.url });
        gifModal.classList.add('hidden');
      });
      gifResults.appendChild(img);
    });
  } catch(err) { console.error(err); }
}

// ---------- YOUTUBE SYNC ----------
ytSyncBtn.addEventListener('click', () => {
  ytPanel.classList.toggle('hidden');
  if (!ytPanel.classList.contains('hidden') && ytReady && !ytPlayer) {
    loadYtPlayer();
  }
});

closeYtPanel.addEventListener('click', () => ytPanel.classList.add('hidden'));

window.onYouTubeIframeAPIReady = function() {
  ytReady = true;
};

function loadYtPlayer() {
  if (ytPlayer) return;
  ytPlayer = new YT.Player('ytPlayerContainer', {
    height: '180',
    width: '100%',
    videoId: '',
    playerVars: { controls: 1 },
    events: {
      onReady: () => { /* */ },
      onStateChange: (event) => {
        if (event.data == YT.PlayerState.PLAYING || event.data == YT.PlayerState.PAUSED) {
          socket.emit('youtube-action', {
            to: currentChatUserId,
            action: event.data == YT.PlayerState.PLAYING ? 'play' : 'pause',
            videoId: ytCurrentVideoId,
            currentTime: ytPlayer.getCurrentTime(),
            isPlaying: event.data == YT.PlayerState.PLAYING
          });
        }
      }
    }
  });
}

ytLoadBtn.addEventListener('click', () => {
  let videoId = ytVideoInput.value.trim();
  if (!videoId) return;
  // Extract id from URL
  if (videoId.includes('youtube.com') || videoId.includes('youtu.be')) {
    const url = new URL(videoId);
    if (videoId.includes('youtu.be')) videoId = url.pathname.slice(1);
    else videoId = url.searchParams.get('v');
  }
  ytCurrentVideoId = videoId;
  if (!ytPlayer && ytReady) loadYtPlayer();
  if (ytPlayer && ytPlayer.loadVideoById) ytPlayer.loadVideoById(videoId);
  socket.emit('youtube-action', {
    to: currentChatUserId,
    action: 'load',
    videoId,
    currentTime: 0,
    isPlaying: true
  });
});

// Receive YouTube actions
socket.on('youtube-action', (data) => {
  if (!currentChatUserId || data.from !== currentChatUserId) return;
  if (!ytPanel.classList.contains('hidden')) {
    if (!ytPlayer && ytReady) loadYtPlayer();
    if (data.action === 'load' && ytPlayer && data.videoId) {
      ytPlayer.loadVideoById(data.videoId, data.currentTime);
      ytCurrentVideoId = data.videoId;
    } else if (data.action === 'play' && ytPlayer) {
      ytPlayer.playVideo();
    } else if (data.action === 'pause' && ytPlayer) {
      ytPlayer.pauseVideo();
    }
    if (data.action === 'seek' && ytPlayer) {
      ytPlayer.seekTo(data.currentTime, true);
    }
  }
});

// Online/offline
socket.on('user-online', (userId) => {
  const li = document.querySelector(`.user-list li[data-user-id="${userId}"]`);
  if (li) li.classList.add('online');
});
socket.on('user-offline', (userId) => {
  const li = document.querySelector(`.user-list li[data-user-id="${userId}"]`);
  if (li) li.classList.remove('online');
});