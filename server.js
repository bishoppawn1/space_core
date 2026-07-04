const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const host = process.env.HOST || "0.0.0.0";
const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
const port = Number(process.env.PORT || 4174);
const root = __dirname;
const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
};

function getLanUrls() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(`http://${entry.address}:${port}/`);
      }
    }
  }

  return [...new Set(addresses)];
}

function resolveFilePath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${displayHost}`).pathname);
  const requestedPath = pathname === "/" ? "index.html" : pathname;
  const filePath = path.join(root, requestedPath);

  if (!filePath.startsWith(root)) {
    return null;
  }

  return filePath;
}

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${displayHost}`).pathname);

  if (pathname === "/server-info.json") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    });
    response.end(JSON.stringify({
      localUrl: `http://${displayHost}:${port}/`,
      lanUrls: getLanUrls(),
    }));
    return;
  }

  const filePath = resolveFilePath(request.url);

  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  });
});

const multiplayerClients = new Map();
const multiplayerRooms = new Map();
const DEFAULT_ROOM_ID = "PUBLIC";
let nextClientId = 1;

function sendJson(clientOrSocket, data) {
  const socket = clientOrSocket.socket ?? clientOrSocket;

  if (!socket || socket.destroyed || socket.writableEnded || socket.writableDestroyed) {
    return false;
  }

  const payload = Buffer.from(JSON.stringify(data));
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  try {
    socket.write(Buffer.concat([header, payload]), (error) => {
      if (error && clientOrSocket.socket) {
        cleanupMultiplayerClient(clientOrSocket);
      }
    });
  } catch (error) {
    if (clientOrSocket.socket) {
      cleanupMultiplayerClient(clientOrSocket);
    }

    return false;
  }

  return true;
}

function broadcastJson(room, data, exceptClientId = null) {
  for (const clientId of room?.clients ?? []) {
    const client = multiplayerClients.get(clientId);

    if (client?.ready && client.id !== exceptClientId) {
      sendJson(client, data);
    }
  }
}

function sendPeerCount(room) {
  if (!room) {
    return;
  }

  broadcastJson(room, {
    type: "peer-count",
    roomId: room.id,
    count: room.clients.size,
  });
}

function getPlayerStates(room, exceptClientId = null) {
  return [...(room?.clients ?? [])]
    .map((clientId) => multiplayerClients.get(clientId))
    .filter(Boolean)
    .filter((client) => client.id !== exceptClientId && client.playerState)
    .map((client) => ({
      id: client.id,
      state: client.playerState,
    }));
}

function getClientRoom(client) {
  return client?.roomId ? multiplayerRooms.get(client.roomId) ?? null : null;
}

function getHostClient(room) {
  return room?.hostClientId ? multiplayerClients.get(room.hostClientId) : null;
}

function getRoomClient(room, clientId) {
  const client = multiplayerClients.get(clientId);
  return client && room?.clients.has(client.id) ? client : null;
}

function getOrCreateRoom(roomId = DEFAULT_ROOM_ID) {
  const id = normalizeRoomId(roomId) || DEFAULT_ROOM_ID;
  let room = multiplayerRooms.get(id);

  if (!room) {
    room = {
      id,
      hostClientId: null,
      sharedWorldState: null,
      clients: new Set(),
    };
    multiplayerRooms.set(id, room);
  }

  return room;
}

function createPrivateRoom() {
  let roomId = "";

  do {
    roomId = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (multiplayerRooms.has(roomId));

  return getOrCreateRoom(roomId);
}

function normalizeRoomId(roomId) {
  return String(roomId ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function leaveRoom(client, options = {}) {
  const room = getClientRoom(client);

  if (!room) {
    client.roomId = null;
    client.ready = false;
    client.isHost = false;
    return;
  }

  const wasHost = room.hostClientId === client.id;
  room.clients.delete(client.id);
  client.roomId = null;
  client.ready = false;
  client.isHost = false;
  client.playerState = null;

  if (wasHost) {
    for (const remainingClientId of room.clients) {
      const remainingClient = multiplayerClients.get(remainingClientId);

      if (!remainingClient) {
        continue;
      }

      remainingClient.roomId = null;
      remainingClient.ready = false;
      remainingClient.isHost = false;
      sendJson(remainingClient, {
        type: "host-left",
        id: client.id,
        roomId: room.id,
      });
    }

    room.clients.clear();
    multiplayerRooms.delete(room.id);
    return;
  }

  if (!options.silent) {
    broadcastJson(room, { type: "player-left", id: client.id, roomId: room.id }, client.id);
    sendPeerCount(room);
  }
}

function joinRoomAsHost(client, room, options = {}) {
  const currentRoom = getClientRoom(client);

  if (currentRoom && currentRoom.id !== room.id) {
    leaveRoom(client);
  }

  client.ready = true;
  client.isHost = true;
  client.roomId = room.id;
  room.hostClientId = client.id;
  room.clients.add(client.id);

  sendJson(client, {
    type: "hosted",
    id: client.id,
    roomId: room.id,
    private: Boolean(options.private),
  });
  sendJson(client, {
    type: "joined",
    id: client.id,
    hostId: room.hostClientId,
    roomId: room.id,
    players: getPlayerStates(room, client.id),
    worldState: room.sharedWorldState,
  });
  sendPeerCount(room);
}

function joinRoomAsGuest(client, room) {
  const currentRoom = getClientRoom(client);

  if (currentRoom && currentRoom.id !== room.id) {
    leaveRoom(client);
  }

  if (room.hostClientId === client.id) {
    room.hostClientId = null;
    room.sharedWorldState = null;
  }

  client.ready = true;
  client.isHost = false;
  client.roomId = room.id;
  room.clients.add(client.id);

  sendJson(client, {
    type: "joined",
    id: client.id,
    hostId: room.hostClientId,
    roomId: room.id,
    players: getPlayerStates(room, client.id),
    worldState: room.sharedWorldState,
  });
  sendPeerCount(room);
}

function cleanupMultiplayerClient(client) {
  if (!multiplayerClients.has(client.id)) {
    return;
  }

  leaveRoom(client);
  multiplayerClients.delete(client.id);
}

function handleMultiplayerMessage(client, message) {
  if (message.type === "create-room") {
    joinRoomAsHost(client, createPrivateRoom(), { private: true });
    return;
  }

  if (message.type === "host-start") {
    const room = getOrCreateRoom(message.roomId || DEFAULT_ROOM_ID);
    const host = getHostClient(room);

    if (host && host.id !== client.id) {
      joinRoomAsGuest(client, room);
      return;
    }

    joinRoomAsHost(client, room);
    return;
  }

  if (message.type === "join-room") {
    const roomId = normalizeRoomId(message.roomId);
    const room = roomId ? multiplayerRooms.get(roomId) : null;

    if (!room || !getHostClient(room)) {
      sendJson(client, {
        type: "error",
        message: "Private room not found.",
        roomId,
      });
      return;
    }

    joinRoomAsGuest(client, room);
    return;
  }

  if (message.type === "join") {
    joinRoomAsGuest(client, getOrCreateRoom(DEFAULT_ROOM_ID));
    return;
  }

  if (message.type === "world-state") {
    const room = getClientRoom(client);

    if (!client.ready || !room || client.id !== room.hostClientId) {
      return;
    }

    room.sharedWorldState = message.worldState ?? null;
    broadcastJson(room, {
      type: "world-state",
      hostId: room.hostClientId,
      roomId: room.id,
      worldState: room.sharedWorldState,
    }, client.id);
    return;
  }

  if (message.type === "grant-pieces") {
    const room = getClientRoom(client);

    if (!client.ready || !room || client.id !== room.hostClientId) {
      return;
    }

    const target = getRoomClient(room, message.targetId);

    if (target?.ready) {
      sendJson(target, {
        type: "grant-pieces",
        pieces: message.pieces ?? {},
        scrap: message.scrap ?? 0,
      });
    }

    return;
  }

  if (message.type === "snapshot") {
    if (!client.ready) {
      return;
    }

    const room = getClientRoom(client);
    const snapshot = message.snapshot ?? {};
    client.playerState = {
      body: snapshot.world?.ship ?? snapshot.body,
      board: snapshot.board ?? [],
      activeEngineIds: snapshot.activeEngineIds ?? [],
    };

    if (!room) {
      return;
    }

    broadcastJson(room, {
      type: "player-state",
      playerId: client.id,
      roomId: room.id,
      state: client.playerState,
    }, client.id);
    return;
  }

  if (message.type === "player-state") {
    if (!client.ready) {
      return;
    }

    const room = getClientRoom(client);
    client.playerState = message.state;

    if (!room) {
      return;
    }

    broadcastJson(room, {
      type: "player-state",
      playerId: client.id,
      roomId: room.id,
      state: client.playerState,
    }, client.id);
    return;
  }

  if (message.type === "damage-player") {
    const room = getClientRoom(client);
    const target = getRoomClient(room, message.targetId);

    if (target?.ready) {
      sendJson(target, {
        type: "damage-player",
        attackerId: client.id,
        damage: message.damage,
      });
    }
  }

  if (message.type === "trade-buy-request") {
    const room = getClientRoom(client);

    if (!client.ready || !room || client.id === room.hostClientId) {
      return;
    }

    const host = getHostClient(room);

    if (host?.ready) {
      sendJson(host, {
        type: "trade-buy-request",
        playerId: client.id,
        requestId: message.requestId,
        traderId: message.traderId,
        slotIndex: message.slotIndex,
        scrap: message.scrap,
      });
    }

    return;
  }

  if (message.type === "trade-buy-result") {
    const room = getClientRoom(client);

    if (!client.ready || !room || client.id !== room.hostClientId) {
      return;
    }

    const target = getRoomClient(room, message.targetId);

    if (target?.ready) {
      sendJson(target, {
        type: "trade-buy-result",
        requestId: message.requestId,
        traderId: message.traderId,
        slotIndex: message.slotIndex,
        ok: Boolean(message.ok),
        item: message.item,
        nextItem: message.nextItem,
        scrap: message.scrap,
        message: message.message,
      });
    }
  }

  if (message.type === "trade-refresh-request") {
    const room = getClientRoom(client);

    if (!client.ready || !room || client.id === room.hostClientId) {
      return;
    }

    const host = getHostClient(room);

    if (host?.ready) {
      sendJson(host, {
        type: "trade-refresh-request",
        playerId: client.id,
        requestId: message.requestId,
        traderId: message.traderId,
        scrap: message.scrap,
      });
    }

    return;
  }

  if (message.type === "trade-refresh-result") {
    const room = getClientRoom(client);

    if (!client.ready || !room || client.id !== room.hostClientId) {
      return;
    }

    const target = getRoomClient(room, message.targetId);

    if (target?.ready) {
      sendJson(target, {
        type: "trade-refresh-result",
        requestId: message.requestId,
        traderId: message.traderId,
        ok: Boolean(message.ok),
        stock: message.stock,
        scrap: message.scrap,
        cost: message.cost,
        message: message.message,
      });
    }

    return;
  }

  if (message.type === "trade-sell-request") {
    const room = getClientRoom(client);

    if (!client.ready || !room || client.id === room.hostClientId) {
      return;
    }

    const host = getHostClient(room);

    if (host?.ready) {
      sendJson(host, {
        type: "trade-sell-request",
        playerId: client.id,
        requestId: message.requestId,
        traderId: message.traderId,
        tileId: message.tileId,
        quantity: message.quantity,
        scrap: message.scrap,
      });
    }

    return;
  }

  if (message.type === "trade-sell-result") {
    const room = getClientRoom(client);

    if (!client.ready || !room || client.id !== room.hostClientId) {
      return;
    }

    const target = getRoomClient(room, message.targetId);

    if (target?.ready) {
      sendJson(target, {
        type: "trade-sell-result",
        requestId: message.requestId,
        traderId: message.traderId,
        tileId: message.tileId,
        quantity: message.quantity,
        price: message.price,
        ok: Boolean(message.ok),
        scrap: message.scrap,
        message: message.message,
      });
    }

    return;
  }
}

function readWebSocketFrames(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);

  while (client.buffer.length >= 2) {
    const firstByte = client.buffer[0];
    const secondByte = client.buffer[1];
    const finished = Boolean(firstByte & 0x80);
    const opcode = firstByte & 0x0f;
    const masked = Boolean(secondByte & 0x80);
    let length = secondByte & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (client.buffer.length < offset + 2) {
        return;
      }

      length = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (client.buffer.length < offset + 8) {
        return;
      }

      length = Number(client.buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = offset + maskLength + length;

    if (client.buffer.length < frameLength) {
      return;
    }

    let payload = client.buffer.subarray(offset + maskLength, frameLength);

    if (masked) {
      const mask = client.buffer.subarray(offset, offset + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }

    client.buffer = client.buffer.subarray(frameLength);

    if (opcode === 0x8) {
      client.socket.end();
      return;
    }

    if (opcode === 0x0) {
      if (!client.fragments) {
        continue;
      }

      client.fragments.push(payload);

      if (finished) {
        handleWebSocketTextMessage(client, Buffer.concat(client.fragments));
        client.fragments = null;
      }

      continue;
    }

    if (opcode !== 0x1) {
      continue;
    }

    if (!finished) {
      client.fragments = [payload];
      continue;
    }

    handleWebSocketTextMessage(client, payload);
  }
}

function handleWebSocketTextMessage(client, payload) {
  try {
    handleMultiplayerMessage(client, JSON.parse(payload.toString("utf8")));
  } catch (error) {
    console.error("Bad multiplayer message:", error.message);
    sendJson(client, { type: "error", message: "Bad multiplayer message." });
  }
}

server.on("upgrade", (request, socket) => {
  const pathname = new URL(request.url, `http://${host}`).pathname;

  if (pathname !== "/multiplayer") {
    socket.destroy();
    return;
  }

  const key = request.headers["sec-websocket-key"];

  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  try {
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n"));
  } catch (error) {
    socket.destroy();
    return;
  }

  const client = {
    id: nextClientId,
    socket,
    buffer: Buffer.alloc(0),
    fragments: null,
    ready: false,
    playerState: null,
  };
  nextClientId += 1;
  multiplayerClients.set(client.id, client);
  sendJson(client, {
    type: "welcome",
    id: client.id,
  });
  sendPeerCount();

  socket.setKeepAlive(true);
  socket.on("data", (chunk) => readWebSocketFrames(client, chunk));
  socket.on("end", () => cleanupMultiplayerClient(client));
  socket.on("close", () => cleanupMultiplayerClient(client));
  socket.on("error", () => cleanupMultiplayerClient(client));
});

server.on("clientError", (error, socket) => {
  socket.destroy();
});

server.on("error", (error) => {
  console.error("Server error:", error.message);
});

server.listen(port, host, () => {
  console.log(`http://${displayHost}:${port}`);
  for (const url of getLanUrls()) {
    console.log(`LAN ${url}`);
  }
});
