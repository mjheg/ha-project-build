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

function handleDogKill(dogId){
  if(gameCleared) return;

  totalKills++;

  if(totalKills >= 30 && dogScale < 2.0)  dogScale = 2.0;
  if(totalKills >= 90 && dogSpeed < 2.5)  dogSpeed = 2.5;
  if(totalKills >= 160)  gameCleared = true;

  io.emit("gameState", getGameState());

  if(gameCleared) io.emit("gameClear", { totalKills });
}

app.get("/", (req, res) => {
  res.json({ version: 4, dogs: Object.keys(dogs).length, totalKills });
});

io.on("connection", (socket) => {

  socket.on("join", (data) => {
    players[socket.id] = {
      id: socket.id,
      nickname: data.nickname,
      x: 0,
      z: 0,
      hp: 100,
      isDead: false
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
    if(!t || t.isDead) return; // 죽은 플레이어는 피격 무시

    t.hp -= 10;
    if(t.hp < 0) t.hp = 0;
    io.emit("playerHit", { id: data.targetId, hp: t.hp });

    if(t.hp <= 0){
      t.isDead = true;
      io.emit("playerDead", { id: data.targetId, killer: socket.id });

      // 3초 후 리스폰
      setTimeout(() => {
        if(!players[data.targetId]) return;
        t.hp = 100;
        t.x = 0;
        t.z = 0;
        t.isDead = false;
        io.emit("playerRespawn", { id: data.targetId, x: 0, z: 0 });
      }, 3000);
    }
  });

  // 강아지 피격 — 서버에서 HP 관리
  socket.on("hitDog", (data) => {
    const dog = dogs[data.id];
    if(!dog) return;

    dog.hp--;

    if(dog.hp <= 0){
      delete dogs[data.id];
      io.emit("removeDog", data.id);
      handleDogKill(data.id);
    } else {
      io.emit("dogHit", { id: data.id, hp: dog.hp });
    }
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
    z: (Math.random()-0.5)*50,
    hp: 3
  };
  io.emit("spawnDog", dogs[id]);
}

setInterval(spawnDog, 200);

server.listen(process.env.PORT || 3000);
