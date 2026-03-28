import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const players = {};
const dogs = {};
let dogId = 0;

let totalKills = 0;
let dogScale = 1.0;
let dogSpeed = 1.0;
let gameCleared = false;

// 서버 시작 시 벽 레이아웃 1회 생성
const wallLayout = [];
for(let i = 0; i < 10; i++){
  wallLayout.push({
    x: (Math.random()-0.5)*80,
    z: (Math.random()-0.5)*80
  });
}

function getGameState(){
  return { totalKills, dogScale, dogSpeed, gameCleared };
}

app.get("/", (req, res) => {
  res.json({ version: 3, dogs: Object.keys(dogs).length, totalKills });
});

io.on("connection", (socket) => {

  socket.on("join", (data) => {
    players[socket.id] = {
      id: socket.id,
      nickname: data.nickname,
      x: 0,
      z: 0,
      hp: 100
    };

    const others = {};
    Object.keys(players).forEach(id => {
      if(id !== socket.id) others[id] = players[id];
    });

    socket.emit("currentPlayers", others);
    socket.emit("mapLayout", wallLayout);
    socket.emit("gameState", getGameState());

    // 현재 살아있는 강아지 신규 플레이어에게 전달
    Object.values(dogs).forEach(dog => {
      socket.emit("spawnDog", dog);
    });

    socket.broadcast.emit("newPlayer", players[socket.id]);
  });

  socket.on("move", (data) => {
    if(players[socket.id]){
      players[socket.id].x = data.x;
      players[socket.id].z = data.z;
      socket.broadcast.emit("playerMove", { id: socket.id, ...data });
    }
  });

  socket.on("hit", (data) => {
    const t = players[data.targetId];
    if(!t) return;
    t.hp -= 20;
    if(t.hp < 0) t.hp = 0;
    io.emit("playerHit", { id: data.targetId, hp: t.hp });
    if(t.hp <= 0){
      io.emit("playerDead", { id: data.targetId, killer: socket.id });
      t.hp = 100;
      t.x = 0;
      t.z = 0;
      io.emit("playerMove", { id: data.targetId, x: t.x, z: t.z });
    }
  });

  socket.on("killDog", (data, ack) => {
    if(!dogs[data.id]) {
      if(typeof ack === 'function') ack("rejected:not_found keys=" + Object.keys(dogs).join(","));
      return;
    }

    delete dogs[data.id];
    io.emit("removeDog", data.id);
    if(typeof ack === 'function') ack("ok");

    if(gameCleared) return;

    totalKills++;

    if(totalKills >= 30 && dogScale < 2.0)  dogScale = 2.0;
    if(totalKills >= 90 && dogSpeed < 2.5)  dogSpeed = 2.5;
    if(totalKills >= 160)  gameCleared = true;

    io.emit("gameState", getGameState());

    if(gameCleared) io.emit("gameClear", { totalKills });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    socket.broadcast.emit("removePlayer", socket.id);
  });
});

function spawnDog(){
  if(gameCleared) return;
  if(Object.keys(dogs).length >= 20) return; // 최대 20마리 제한
  const id = "dog_" + dogId++;
  dogs[id] = {
    id,
    x: (Math.random()-0.5)*50,
    z: (Math.random()-0.5)*50
  };
  io.emit("spawnDog", dogs[id]);
}

setInterval(spawnDog, 1000);

server.listen(process.env.PORT || 3000);
