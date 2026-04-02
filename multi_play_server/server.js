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

  if(totalKills >= 30 && dogScale < 3.0)  dogScale = 3.0;
  if(totalKills >= 90 && dogSpeed < 6.0)  dogSpeed = 6.0;
  if(totalKills >= 160)  gameCleared = true;

  io.emit("gameState", getGameState());

  if(gameCleared){
    io.emit("gameClear", { totalKills });
    // 10초 후 게임 전체 초기화
    setTimeout(() => {
      totalKills = 0;
      dogScale = 1.0;
      dogSpeed = 1.0;
      gameCleared = false;
      Object.keys(dogs).forEach(id => delete dogs[id]);
      io.emit("gameReset");
    }, 10000);
  }
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
  if(Object.keys(dogs).length >= 20) return;
  const id = "dog_" + dogId++;
  dogs[id] = {
    id,
    x: (Math.random()-0.5)*50,
    z: (Math.random()-0.5)*50,
    hp: 3
  };
  io.emit("spawnDog", dogs[id]);
}

// 서버에서 강아지 이동 계산 후 브로드캐스트 (50ms 틱)
function tickDogs(){
  if(gameCleared) return;
  const alivePlayers = Object.values(players).filter(p => !p.isDead);
  if(alivePlayers.length === 0) return;

  const updates = [];

  Object.values(dogs).forEach(dog => {
    // 가장 가까운 플레이어를 향해 이동
    let nearest = null;
    let nearestDist = Infinity;
    alivePlayers.forEach(p => {
      const dx = p.x - dog.x;
      const dz = p.z - dog.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if(dist < nearestDist){ nearestDist = dist; nearest = p; }
    });

    if(!nearest || nearestDist < 0.1) return;

    const step = 0.15 * dogSpeed; // 50ms 틱 기준 이동량
    dog.x += ((nearest.x - dog.x) / nearestDist) * step;
    dog.z += ((nearest.z - dog.z) / nearestDist) * step;

    updates.push({ id: dog.id, x: dog.x, z: dog.z });
  });

  if(updates.length > 0){
    io.emit("dogPositions", updates);
  }
}

// 강아지 근접 피해 — 100ms마다 1 HP 감소 (= 10 HP/초)
function tickDogDamage(){
  if(gameCleared) return;
  Object.values(dogs).forEach(dog => {
    Object.values(players).forEach(p => {
      if(p.isDead) return;
      const dx = p.x - dog.x;
      const dz = p.z - dog.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if(dist < 2 * dogScale){
        p.hp = Math.max(0, p.hp - 1);
        io.emit("playerHit", { id: p.id, hp: p.hp });
        if(p.hp <= 0){
          p.isDead = true;
          io.emit("playerDead", { id: p.id, killer: null });
          setTimeout(() => {
            if(!players[p.id]) return;
            p.hp = 100;
            p.x = 0;
            p.z = 0;
            p.isDead = false;
            io.emit("playerRespawn", { id: p.id, x: 0, z: 0 });
          }, 3000);
        }
      }
    });
  });
}

setInterval(spawnDog, 200);
setInterval(tickDogs, 50);
setInterval(tickDogDamage, 100);

server.listen(process.env.PORT || 3000);
