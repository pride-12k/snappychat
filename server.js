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
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, '[]');
if (!fs.existsSync('public/uploads')) fs.mkdirSync('public/uploads', { recursive: true });
if (!fs.existsSync('public/snaps')) fs.mkdirSync('public/snaps', { recursive: true });
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

// ---------- UPLOAD SNAP (photo) ----------
app.post('/upload-snap', upload.single('snap'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ---------- SEARCH USER ----------
app.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  const results = users
    .filter(u => u.username.toLowerCase().includes(q.toLowerCase()))
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

  // ---------- YOUTUBE SYNC ----------
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

  socket.on('disconnect', () => {
    if (currentUserId) {
      onlineUsers.delete(currentUserId);
      io.emit('user-offline', currentUserId);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});