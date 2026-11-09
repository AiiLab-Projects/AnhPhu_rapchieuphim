const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8080;

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// ==========================================
// MULTIPLAYER STATE
// ==========================================
const players = new Map(); // id -> playerData
let nextPlayerNumber = 1;

// Global Synchronized Video Cinema State
let cinemaVideoState = {
    mode: 'canvas', // 'canvas' | 'video' | 'youtube'
    src: '',
    title: 'Intro IMAX 3D',
    currentTime: 0,
    isPlaying: true,
    lastUpdateTimestamp: Date.now()
};
let videoControllerId = null;

function getCurrentVideoState() {
    const now = Date.now();
    const currentTime = cinemaVideoState.isPlaying && (cinemaVideoState.mode === 'video' || cinemaVideoState.mode === 'youtube')
        ? cinemaVideoState.currentTime + (now - cinemaVideoState.lastUpdateTimestamp) / 1000
        : cinemaVideoState.currentTime;

    return {
        ...cinemaVideoState,
        currentTime,
        lastUpdateTimestamp: now
    };
}

const AVATAR_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#10b981',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];

function broadcast(data, excludeWs = null) {
    const jsonStr = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(jsonStr);
        }
    });
}

// Heartbeat to prune dead connections
const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

wss.on('connection', ws => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    const playerId = 'player_' + Math.random().toString(36).substr(2, 9);
    ws.playerId = playerId;
    const playerNum = nextPlayerNumber++;
    const defaultColor = AVATAR_COLORS[(playerNum - 1) % AVATAR_COLORS.length];

    // Spawn player in the central aisle near row J
    const newPlayer = {
        id: playerId,
        name: `Khán giả #${playerNum}`,
        color: defaultColor,
        x: (Math.random() - 0.5) * 2,
        y: 4.8, // Default aisle height
        z: 8.0 + (Math.random() - 0.5) * 2,
        yaw: 0, // Facing screen (negative Z)
        state: 'standing', // 'standing' | 'walking' | 'sitting'
        seatId: null
    };

    players.set(playerId, newPlayer);

    // Send Welcome payload with current world state to new player
    ws.send(JSON.stringify({
        type: 'welcome',
        playerId: playerId,
        playerData: newPlayer,
        allPlayers: Array.from(players.values()),
        videoState: getCurrentVideoState(),
        videoControllerId
    }));

    // Broadcast new player to all existing clients
    broadcast({
        type: 'player_joined',
        player: newPlayer
    }, ws);

    // Handle incoming client messages
    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            const p = players.get(playerId);
            if (!p) return;

            switch (data.type) {
                case 'update_profile': {
                    if (data.name) p.name = String(data.name).trim().substring(0, 24);
                    if (data.color) p.color = String(data.color);
                    broadcast({
                        type: 'player_profile_updated',
                        playerId: playerId,
                        name: p.name,
                        color: p.color
                    });
                    break;
                }

                case 'move': {
                    p.x = data.x;
                    p.y = data.y;
                    p.z = data.z;
                    p.yaw = data.yaw;
                    p.state = data.state;
                    p.seatId = data.seatId || null;

                    // Relay position to all other players
                    broadcast({
                        type: 'player_moved',
                        playerId: playerId,
                        x: p.x,
                        y: p.y,
                        z: p.z,
                        yaw: p.yaw,
                        state: p.state,
                        seatId: p.seatId
                    }, ws);
                    break;
                }

                case 'sit': {
                    p.seatId = data.seatId;
                    p.state = 'sitting';
                    if (data.x !== undefined) p.x = data.x;
                    if (data.y !== undefined) p.y = data.y;
                    if (data.z !== undefined) p.z = data.z;
                    if (data.yaw !== undefined) p.yaw = data.yaw;

                    broadcast({
                        type: 'player_sat',
                        playerId: playerId,
                        seatId: p.seatId,
                        x: p.x,
                        y: p.y,
                        z: p.z,
                        yaw: p.yaw
                    });
                    break;
                }

                case 'stand': {
                    p.seatId = null;
                    p.state = 'standing';
                    if (data.x !== undefined) p.x = data.x;
                    if (data.y !== undefined) p.y = data.y;
                    if (data.z !== undefined) p.z = data.z;

                    broadcast({
                        type: 'player_stood',
                        playerId: playerId,
                        x: p.x,
                        y: p.y,
                        z: p.z
                    });
                    break;
                }

                case 'chat': {
                    const text = String(data.text || '').trim().substring(0, 150);
                    if (text.length > 0) {
                        broadcast({
                            type: 'player_chat',
                            playerId: playerId,
                            name: p.name,
                            text: text,
                            timestamp: Date.now()
                        });
                    }
                    break;
                }

                case 'emote': {
                    broadcast({
                        type: 'player_emote',
                        playerId: playerId,
                        emote: data.emote
                    });
                    break;
                }

                case 'sync_video': {
                    const mode = ['canvas', 'video', 'youtube'].includes(data.mode) ? data.mode : 'video';
                    const action = ['load', 'play', 'pause', 'seek', 'tick'].includes(data.action) ? data.action : 'load';
                    if (action === 'tick' && playerId !== videoControllerId) break;

                    const currentTime = Number(data.currentTime);
                    if (action !== 'tick') videoControllerId = playerId;
                    cinemaVideoState = {
                        mode,
                        src: typeof data.src === 'string' ? data.src.substring(0, 2048) : '',
                        title: typeof data.title === 'string' ? data.title.substring(0, 120) : 'Video',
                        currentTime: Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0,
                        isPlaying: typeof data.isPlaying === 'boolean' ? data.isPlaying : action !== 'pause',
                        lastUpdateTimestamp: Date.now()
                    };

                    broadcast({
                        type: 'video_synced',
                        videoState: cinemaVideoState,
                        action,
                        byPlayer: p.name,
                        videoControllerId
                    }, ws);
                    break;
                }
            }
        } catch (err) {
            console.error('Error handling message:', err);
        }
    });

    ws.on('close', () => {
        players.delete(playerId);
        broadcast({
            type: 'player_left',
            playerId: playerId
        });
        if (videoControllerId === playerId) {
            cinemaVideoState = getCurrentVideoState();
            const nextController = Array.from(wss.clients).find(client => client.readyState === WebSocket.OPEN);
            videoControllerId = nextController ? nextController.playerId : null;
            broadcast({
                type: 'video_synced',
                videoState: cinemaVideoState,
                action: 'tick',
                byPlayer: 'Hệ thống',
                videoControllerId
            });
        }
    });
});

server.listen(PORT, () => {
    console.log(`🎬 Rạp Chiếu Phim Multiplayer 3D đang chạy tại: http://localhost:${PORT}`);
});
