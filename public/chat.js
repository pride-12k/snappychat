const user = JSON.parse(localStorage.getItem('user'));
if (!user) window.location.href = 'index.html';

const socket = io();
let currentChatUserId = null;
let ytPlayer = null;
let ytReady = false;
let ytCurrentVideoId = null;

// Keep track of online users for green dot
const onlineUsers = new Set();

// DOM elements
const mainScreen = document.getElementById('mainScreen');
const chatScreen = document.getElementById('chatScreen');
const friendList = document.getElementById('friendList');
const requestList = document.getElementById('requestList');
const searchInput = document.getElementById('searchInput');
const chatsTabBtn = document.getElementById('chatsTabBtn');
const requestsTabBtn2 = document.getElementById('requestsTabBtn2');
const requestsTabBtn = document.getElementById('requestsTabBtn');
const chatsPane = document.getElementById('chatsPane');
const requestsPane = document.getElementById('requestsPane');
const backBtn = document.getElementById('backBtn');
const chatPartnerDp = document.getElementById('chatPartnerDp');
const chatPartnerName = document.getElementById('chatPartnerName');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');

// Snap elements
const snapBtn = document.getElementById('snapBtn');
const snapFileInput = document.getElementById('snapFileInput');
const snapModal = document.getElementById('snapModal');
const snapPreviewImg = document.getElementById('snapPreviewImg');
const sendSnapBtn = document.getElementById('sendSnapBtn');
const closeSnapBtn = document.getElementById('closeSnapBtn');
const filterButtons = document.querySelectorAll('.filter-buttons button');
const snapCanvas = document.getElementById('snapCanvas');

// GIF elements
const gifBtn = document.getElementById('gifBtn');
const gifModal = document.getElementById('gifModal');
const gifSearchInput = document.getElementById('gifSearchInput');
const gifResults = document.getElementById('gifResults');
const closeGifBtn = document.getElementById('closeGifBtn');

// YT elements
const ytSyncBtn = document.getElementById('ytSyncBtn');
const ytPanel = document.getElementById('ytPanel');
const closeYtPanel = document.getElementById('closeYtPanel');
const ytVideoInput = document.getElementById('ytVideoInput');
const ytLoadBtn = document.getElementById('ytLoadBtn');
const ytPlayerContainer = document.getElementById('ytPlayerContainer');

// Join socket
socket.emit('join', user.id);

// ========== TAB SWITCHING ==========
chatsTabBtn.addEventListener('click', () => {
  chatsTabBtn.classList.add('active');
  requestsTabBtn2.classList.remove('active');
  chatsPane.classList.add('active');
  requestsPane.classList.remove('active');
  loadFriends();
});
requestsTabBtn2.addEventListener('click', () => {
  requestsTabBtn2.classList.add('active');
  chatsTabBtn.classList.remove('active');
  requestsPane.classList.add('active');
  chatsPane.classList.remove('active');
  loadFriendRequests();
});
requestsTabBtn.addEventListener('click', () => {
  requestsTabBtn2.click();
});

// ========== Apply online status ==========
function applyOnlineStatus() {
  document.querySelectorAll('.friend-list li').forEach(li => {
    const userId = li.dataset.userId;
    if (onlineUsers.has(userId)) {
      li.classList.add('online');
    } else {
      li.classList.remove('online');
    }
  });
}

// ========== LOAD FRIENDS ==========
function loadFriends() {
  fetch(`/friends/${user.id}`)
    .then(res => res.json())
    .then(friends => {
      friendList.innerHTML = '';
      if (friends.length === 0) {
        friendList.innerHTML = '<li style="padding:20px;text-align:center;color:#888;">No friends yet. Search a username to add.</li>';
        return;
      }
      friends.forEach(f => {
        if (f.id === user.id) return; // prevent self
        const li = document.createElement('li');
        const lastMsgText = f.lastMessage ? (f.lastMessage.length > 25 ? f.lastMessage.substring(0,25)+'…' : f.lastMessage) : '';
        const timeStr = f.lastTime ? new Date(f.lastTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
        li.innerHTML = `
          <img src="${f.dp}" alt="">
          <div class="friend-info">
            <div class="name">${f.username}</div>
            <div class="last-msg">${lastMsgText || 'Start chatting!'}</div>
          </div>
          <span class="friend-time">${timeStr}</span>
          <span class="online-dot"></span>
        `;
        li.dataset.userId = f.id;
        li.addEventListener('click', () => openChat(f));
        friendList.appendChild(li);
      });
      applyOnlineStatus(); // apply green dots after rendering
    });
}

// ========== LOAD FRIEND REQUESTS ==========
function loadFriendRequests() {
  fetch(`/friend-requests/${user.id}`)
    .then(res => res.json())
    .then(requests => {
      requestList.innerHTML = '';
      if (requests.length === 0) {
        requestList.innerHTML = '<li style="padding:20px;text-align:center;color:#888;">No pending requests</li>';
        return;
      }
      requests.forEach(req => {
        const li = document.createElement('li');
        li.innerHTML = `
          <img src="${req.senderDp}" alt="">
          <div class="friend-info">
            <div class="name">${req.senderUsername}</div>
            <div style="font-size:0.8rem;color:#aaa;">wants to be friend</div>
          </div>
          <div class="request-actions">
            <button class="accept-btn" data-id="${req.id}">Accept</button>
            <button class="reject-btn" data-id="${req.id}">Reject</button>
          </div>
        `;
        requestList.appendChild(li);
        li.querySelector('.accept-btn').addEventListener('click', () => acceptRequest(req.id));
        li.querySelector('.reject-btn').addEventListener('click', () => rejectRequest(req.id));
      });
    });
}

async function acceptRequest(requestId) {
  await fetch('/accept-friend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, userId: user.id })
  });
  loadFriendRequests();
}
async function rejectRequest(requestId) {
  await fetch('/reject-friend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, userId: user.id })
  });
  loadFriendRequests();
}

// ========== SEARCH USERS & SEND REQUEST ==========
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  if (q.length < 2) { loadFriends(); return; }
  fetch(`/search?q=${encodeURIComponent(q)}&userId=${user.id}`)
    .then(res => res.json())
    .then(users => {
      friendList.innerHTML = '';
      if (users.length === 0) {
        friendList.innerHTML = '<li style="padding:20px;text-align:center;color:#888;">No users found. Tap to send friend request.</li>';
        return;
      }
      users.forEach(u => {
        if (u.id === user.id) return;
        const li = document.createElement('li');
        li.innerHTML = `
          <img src="${u.dp}" alt="">
          <div class="friend-info">
            <div class="name">${u.username}</div>
            <div style="font-size:0.8rem;color:#aaa;">Not a friend yet</div>
          </div>
          <button class="accept-btn add-friend-btn" data-username="${u.username}">Add</button>
        `;
        li.querySelector('.add-friend-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          sendFriendRequest(u.username);
        });
        friendList.appendChild(li);
      });
    });
});

async function sendFriendRequest(username) {
  const res = await fetch('/friend-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromId: user.id, toUsername: username })
  });
  if (res.ok) alert('Friend request sent!');
  else {
    const data = await res.json();
    alert(data.error || 'Failed');
  }
}

// ========== OPEN CHAT ==========
function openChat(partner) {
  currentChatUserId = partner.id;
  chatPartnerDp.src = partner.dp;
  chatPartnerName.textContent = partner.username;
  mainScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  messagesDiv.innerHTML = '';
  typingIndicator.classList.add('hidden');
  ytPanel.classList.add('hidden');
  socket.emit('get-conversation', partner.id);
  if (ytPlayer) {
    ytPlayer.destroy();
    ytPlayer = null;
  }
}

backBtn.addEventListener('click', () => {
  chatScreen.classList.add('hidden');
  mainScreen.classList.remove('hidden');
  currentChatUserId = null;
  loadFriends(); // refresh online status when back
});

// ========== MESSAGE DISPLAY (Instagram preview) ==========
socket.on('conversation-history', (msgs) => {
  messagesDiv.innerHTML = '';
  msgs.forEach(m => displayMessage(m));
  scrollToBottom();
});

socket.on('chat-message', (msg) => {
  if (currentChatUserId && (msg.from === currentChatUserId || msg.to === currentChatUserId)) {
    displayMessage(msg);
    scrollToBottom();
  }
  loadFriends();
});

function displayMessage(msg) {
  const div = document.createElement('div');
  div.classList.add('message');
  div.classList.add(msg.from === user.id ? 'sent' : 'received');
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  let content = '';

  if (msg.type === 'snap') {
    content = `<img src="${msg.mediaUrl}" alt="snap"><div class="time">${time}</div>`;
  } else if (msg.type === 'gif') {
    content = `<img src="${msg.mediaUrl}" class="gif-img" alt="gif"><div class="time">${time}</div>`;
  } else if (msg.type === 'instagram') {
    // Show Instagram preview card (thumbnail + link) instead of iframe
    const originalUrl = msg.text.replace('/embed/', '/'); // convert back to original link
    content = `
      <div class="insta-preview-card">
        <a href="${originalUrl}" target="_blank" rel="noopener noreferrer">
          <div class="insta-thumb" id="thumb-${msg.id}">
            <span class="insta-loader">Loading preview...</span>
          </div>
          <div class="insta-info">📸 Instagram Reel</div>
        </a>
      </div>
      <div class="time">${time}</div>
    `;
    // Fetch thumbnail asynchronously via oEmbed
    fetchInstagramPreview(msg.id, originalUrl);
  } else {
    content = `${msg.text}<div class="time">${time}</div>`;
  }
  div.innerHTML = content;
  messagesDiv.appendChild(div);
}

async function fetchInstagramPreview(msgId, postUrl) {
  try {
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(postUrl)}`;
    const res = await fetch(oembedUrl);
    const data = await res.json();
    const thumbContainer = document.getElementById(`thumb-${msgId}`);
    if (thumbContainer && data.thumbnail_url) {
      thumbContainer.innerHTML = `<img src="${data.thumbnail_url}" alt="Instagram Reel" style="width:100%; border-radius:10px;">`;
    }
  } catch (err) {
    console.log('Instagram preview not available');
  }
}

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ========== SEND TEXT / INSTA ==========
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentChatUserId) return;
  const instaRegex = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[a-zA-Z0-9_-]+/i;
  if (instaRegex.test(text)) {
    // Store original link, not embed
    socket.emit('private-message', { to: currentChatUserId, text: text, type: 'instagram' });
  } else {
    socket.emit('private-message', { to: currentChatUserId, text, type: 'text' });
  }
  messageInput.value = '';
  socket.emit('stop-typing', currentChatUserId);
}
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

// ========== TYPING INDICATOR ==========
let typingTimer;
messageInput.addEventListener('input', () => {
  if (!currentChatUserId) return;
  socket.emit('typing', currentChatUserId);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit('stop-typing', currentChatUserId);
  }, 2000);
});

socket.on('user-typing', (data) => {
  if (currentChatUserId === data.from) typingIndicator.classList.remove('hidden');
});
socket.on('user-stop-typing', (data) => {
  if (currentChatUserId === data.from) typingIndicator.classList.add('hidden');
});

// ========== SNAP ==========
snapBtn.addEventListener('click', () => snapFileInput.click());
snapFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    snapPreviewImg.src = ev.target.result;
    snapPreviewImg.style.filter = 'none';
    snapModal.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});
filterButtons.forEach(btn => {
  btn.addEventListener('click', () => snapPreviewImg.style.filter = btn.dataset.filter);
});
closeSnapBtn.addEventListener('click', () => snapModal.classList.add('hidden'));
sendSnapBtn.addEventListener('click', async () => {
  if (!snapPreviewImg.src || !currentChatUserId) return;
  const canvas = snapCanvas;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = snapPreviewImg.src;
  img.onload = async () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.filter = snapPreviewImg.style.filter || 'none';
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
    const formData = new FormData();
    formData.append('snap', blob, 'snap.jpg');
    const res = await fetch('/upload-snap', { method:'POST', body:formData });
    const data = await res.json();
    socket.emit('private-message', { to: currentChatUserId, text:'', type:'snap', mediaUrl: data.url });
    snapModal.classList.add('hidden');
  };
});

// ========== GIF ==========
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
  const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(q)}&limit=12`);
  const json = await res.json();
  gifResults.innerHTML = '';
  json.data.forEach(gif => {
    const img = document.createElement('img');
    img.src = gif.images.fixed_height_small.url;
    img.addEventListener('click', () => {
      socket.emit('private-message', { to: currentChatUserId, text:'', type:'gif', mediaUrl: gif.images.fixed_height.url });
      gifModal.classList.add('hidden');
    });
    gifResults.appendChild(img);
  });
}

// ========== YOUTUBE SYNC ==========
ytSyncBtn.addEventListener('click', () => {
  ytPanel.classList.toggle('hidden');
  if (!ytPanel.classList.contains('hidden') && ytReady && !ytPlayer) {
    loadYtPlayer();
  }
});
closeYtPanel.addEventListener('click', () => {
  ytPanel.classList.add('hidden');
});

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
      onReady: () => {},
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
  if (videoId.includes('youtube.com') || videoId.includes('youtu.be')) {
    const url = new URL(videoId);
    videoId = videoId.includes('youtu.be') ? url.pathname.slice(1) : url.searchParams.get('v');
  }
  ytCurrentVideoId = videoId;
  if (!ytPlayer && ytReady) loadYtPlayer();
  if (ytPlayer && ytPlayer.loadVideoById) {
    ytPlayer.loadVideoById(videoId);
    socket.emit('youtube-action', { to: currentChatUserId, action:'load', videoId, currentTime:0, isPlaying:true });
  }
});

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
  }
});

// ========== ONLINE STATUS (fixed) ==========
socket.on('user-online', (userId) => {
  onlineUsers.add(userId);
  applyOnlineStatus();
});

socket.on('user-offline', (userId) => {
  onlineUsers.delete(userId);
  applyOnlineStatus();
});

// Initial load
loadFriends();
