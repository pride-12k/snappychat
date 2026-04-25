const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static('public'));

// ---------- FILE UPLOAD ----------
const storage = multer.diskStorage({
  destination: 'public/uploads/',
  filename: (req, file, cb) => {
    cb(null, uuidv4() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ---------- DATA FILES ----------
const USERS_FILE = 'users.json';
const CHAT_FILE = 'chats.json';
const FRIENDS_FILE = 'friends.json';
const FRIEND_REQUESTS_FILE = 'friend_requests.json';

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, '[]');
if (!fs.existsSync(FRIENDS_FILE)) fs.writeFileSync(FRIENDS_FILE, '{}');
if (!fs.existsSync(FRIEND_REQUESTS_FILE)) fs.writeFileSync(FRIEND_REQUESTS_FILE, '[]');
if (!fs.existsSync('public/uploads')) fs.mkdirSync('public/uploads', { recursive: true });
if (!fs.existsSync('public/default-dp.png')) fs.writeFileSync('public/default-dp.png', '');

// ---------- AUTH ROUTES ----------
app.post('/signup', upload.single('dp'), async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  let users = JSON.parse(fs.readFileSync(USERS_FILE));
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: uuidv4(),
    username,
    password: hashedPassword,
    dp: req.file ? '/uploads/' + req.file.filename : '/default-dp.png'
  };
  users.push(newUser);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  const friends = JSON.parse(fs.readFileSync(FRIENDS_FILE));
  friends[newUser.id] = [];
  fs.writeFileSync(FRIENDS_FILE, JSON.stringify(friends, null, 2));

  res.json({ success: true, user: { id: newUser.id, username, dp: newUser.dp } });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  const user = users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'User not found' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: 'Wrong password' });

  res.json({ success: true, user: { id: user.id, username: user.username, dp: user.dp } });
});

// ---------- UPDATE PROFILE ----------
app.post('/update-profile', upload.single('dp'), (req, res) => {
  const { userId, username } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID required' });

  let users = JSON.parse(fs.readFileSync(USERS_FILE));
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

  if (username) {
    if (users.find(u => u.username === username && u.id !== userId)) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    users[userIndex].username = username;
  }
  if (req.file) {
    users[userIndex].dp = '/uploads/' + req.file.filename;
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  const updatedUser = users[userIndex];
  res.json({ success: true, user: { id: updatedUser.id, username: updatedUser.username, dp: updatedUser.dp } });
});

// ---------- UPLOAD MEDIA (snap & video) ----------
app.post('/upload-media', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  res.json({ url: '/uploads/' + req.file.filename, type });
});

// ---------- FRIEND REQUESTS ----------
app.post('/friend-request', (req, res) => {
  const { fromId, toUsername } = req.body;
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  const toUser = users.find(u => u.username === toUsername);
  if (!toUser) return res.status(404).json({ error: 'User not found' });
  if (toUser.id === fromId) return res.status(400).json({ error: 'Cannot friend yourself' });

  const friends = JSON.parse(fs.readFileSync(FRIENDS_FILE));
  if (friends[fromId] && friends[fromId].includes(toUser.id)) {
    return res.status(400).json({ error: 'Already friends' });
  }

  const requests = JSON.parse(fs.readFileSync(FRIEND_REQUESTS_FILE));
  const existing = requests.find(r => r.from === fromId && r.to === toUser.id && r.status === 'pending');
  if (existing) return res.status(400).json({ error: 'Request already sent' });

  const newReq = { id: uuidv4(), from: fromId, to: toUser.id, status: 'pending', timestamp: Date.now() };
  requests.push(newReq);
  fs.writeFileSync(FRIEND_REQUESTS_FILE, JSON.stringify(requests, null, 2));
  res.json({ success: true });
});

app.get('/friend-requests/:userId', (req, res) => {
  const requests = JSON.parse(fs.readFileSync(FRIEND_REQUESTS_FILE));
  const userReqs = requests.filter(r => r.to === req.params.userId && r.status === 'pending');
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  const populated = userReqs.map(r => {
    const sender = users.find(u => u.id === r.from);
    return { ...r, senderUsername: sender ? sender.username : 'Unknown', senderDp: sender ? sender.dp : '/default-dp.png' };
  });
  res.json(populated);
});

app.post('/accept-friend', (req, res) => {
  const { requestId, userId } = req.body;
  const requests = JSON.parse(fs.readFileSync(FRIEND_REQUESTS_FILE));
  const reqIndex = requests.findIndex(r => r.id === requestId);
  if (reqIndex === -1) return res.status(404).json({ error: 'Request not found' });
  const request = requests[reqIndex];
  if (request.to !== userId) return res.status(403).json({ error: 'Not authorized' });

  requests[reqIndex].status = 'accepted';
  fs.writeFileSync(FRIEND_REQUESTS_FILE, JSON.stringify(requests, null, 2));

  const friends = JSON.parse(fs.readFileSync(FRIENDS_FILE));
  if (!friends[request.from]) friends[request.from] = [];
  if (!friends[request.to]) friends[request.to] = [];
  if (!friends[request.from].includes(request.to)) friends[request.from].push(request.to);
  if (!friends[request.to].includes(request.from)) friends[request.to].push(request.from);
  fs.writeFileSync(FRIENDS_FILE, JSON.stringify(friends, null, 2));

  res.json({ success: true });
});

app.post('/reject-friend', (req, res) => {
  const { requestId, userId } = req.body;
  const requests = JSON.parse(fs.readFileSync(FRIEND_REQUESTS_FILE));
  const reqIndex = requests.findIndex(r => r.id === requestId);
  if (reqIndex === -1) return res.status(404).json({ error: 'Request not found' });
  if (requests[reqIndex].to !== userId) return res.status(403).json({ error: 'Not authorized' });
  requests[reqIndex].status = 'rejected';
  fs.writeFileSync(FRIEND_REQUESTS_FILE, JSON.stringify(requests, null, 2));
  res.json({ success: true });
});

// ---------- GET FRIENDS LIST ----------
app.get('/friends/:userId', (req, res) => {
  const friends = JSON.parse(fs.readFileSync(FRIENDS_FILE));
  const userFriends = friends[req.params.userId] || [];
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  const chats = JSON.parse(fs.readFileSync(CHAT_FILE));

  const friendList = userFriends.map(friendId => {
    const friend = users.find(u => u.id === friendId);
    if (!friend) return null;
    const conv = chats.filter(m =>
      (m.from === req.params.userId && m.to === friendId) ||
      (m.from === friendId && m.to === req.params.userId)
    ).sort((a, b) => a.timestamp - b.timestamp);
    const lastMsg = conv.length > 0 ? conv[conv.length - 1] : null;
    return {
      id: friend.id,
      username: friend.username,
      dp: friend.dp,
      lastMessage: lastMsg ? (lastMsg.type === 'text' ? lastMsg.text : (lastMsg.type === 'snap' ? '📷 Snap' : lastMsg.type === 'gif' ? '🎞️ GIF' : lastMsg.type === 'video' ? '🎥 Video' : '📹 Instagram')) : '',
      lastTime: lastMsg ? lastMsg.timestamp : null
    };
  }).filter(Boolean).sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
  res.json(friendList);
});

// ---------- SEARCH USER ----------
app.get('/search', (req, res) => {
  const { q, userId } = req.query;
  if (!q || !userId) return res.json([]);
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  const friends = JSON.parse(fs.readFileSync(FRIENDS_FILE));
  const myFriends = friends[userId] || [];
  const results = users
    .filter(u =>
      u.id !== userId &&
      !myFriends.includes(u.id) &&
      u.username.toLowerCase().includes(q.toLowerCase())
    )
    .map(u => ({ id: u.id, username: u.username, dp: u.dp }));
  res.json(results);
});

// ---------- ONLINE USERS ----------
const onlineUsers = new Map();

io.on('connection', (socket) => {
  let currentUserId = null;

  socket.on('join', (userId) => {
    currentUserId = userId;
    onlineUsers.set(userId, socket.id);
    io.emit('user-online', userId);

    let chats = JSON.parse(fs.readFileSync(CHAT_FILE));
    const pending = chats.filter(m => m.to === userId && !m.delivered);
    pending.forEach(m => {
      socket.emit('chat-message', m);
      m.delivered = true;
    });
    fs.writeFileSync(CHAT_FILE, JSON.stringify(chats, null, 2));
  });

  socket.on('private-message', (data) => {
    const { to, text, type, mediaUrl } = data;
    if (!currentUserId || !to) return;

    let chats = JSON.parse(fs.readFileSync(CHAT_FILE));
    const conv = chats.filter(
      m => (m.from === currentUserId && m.to === to) || (m.from === to && m.to === currentUserId)
    );
    conv.sort((a, b) => a.timestamp - b.timestamp);
    if (conv.length >= 100) {
      const toRemove = conv.slice(0, conv.length - 99);
      toRemove.forEach(rm => {
        const idx = chats.indexOf(rm);
        if (idx > -1) chats.splice(idx, 1);
      });
    }

    const newMsg = {
      id: uuidv4(),
      from: currentUserId,
      to,
      text: text || '',
      type: type || 'text',
      mediaUrl: mediaUrl || '',
      timestamp: Date.now(),
      delivered: false
    };

    chats.push(newMsg);
    fs.writeFileSync(CHAT_FILE, JSON.stringify(chats, null, 2));

    const recipientSocket = onlineUsers.get(to);
    if (recipientSocket) {
      io.to(recipientSocket).emit('chat-message', newMsg);
      newMsg.delivered = true;
      chats = JSON.parse(fs.readFileSync(CHAT_FILE));
      const idx = chats.findIndex(m => m.id === newMsg.id);
      if (idx > -1) chats[idx].delivered = true;
      fs.writeFileSync(CHAT_FILE, JSON.stringify(chats, null, 2));
    }
    socket.emit('chat-message', newMsg);
  });

  socket.on('get-conversation', (withUserId) => {
    if (!currentUserId) return;
    const chats = JSON.parse(fs.readFileSync(CHAT_FILE));
    const conv = chats
      .filter(
        m => (m.from === currentUserId && m.to === withUserId) ||
             (m.from === withUserId && m.to === currentUserId)
      )
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-100);
    socket.emit('conversation-history', conv);
  });

  socket.on('typing', (to) => {
    if (!currentUserId || !to) return;
    const recipientSocket = onlineUsers.get(to);
    if (recipientSocket) {
      io.to(recipientSocket).emit('user-typing', { from: currentUserId });
    }
  });

  socket.on('stop-typing', (to) => {
    if (!currentUserId || !to) return;
    const recipientSocket = onlineUsers.get(to);
    if (recipientSocket) {
      io.to(recipientSocket).emit('user-stop-typing', { from: currentUserId });
    }
  });

  socket.on('disconnect', () => {
    if (currentUserId) {
      onlineUsers.delete(currentUserId);
      io.emit('user-offline', currentUserId);
    }
  });

  socket.on('youtube-action', (data) => {
    const { to, action, videoId, currentTime, isPlaying } = data;
    if (!currentUserId || !to) return;
    const recipientSocket = onlineUsers.get(to);
    if (recipientSocket) {
      io.to(recipientSocket).emit('youtube-action', {
        from: currentUserId,
        action,
        videoId,
        currentTime,
        isPlaying
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
