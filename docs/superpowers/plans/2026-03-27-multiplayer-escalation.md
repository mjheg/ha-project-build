# Multiplayer Escalation + Walls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버/클라이언트에 공유 킬카운터 + 에스컬레이션(30/90/160킬) + 서버 동기화 벽을 추가하고 GitHub에 푸시한다.

**Architecture:** 서버가 `totalKills`/`dogScale`/`dogSpeed`/`wallLayout`을 권위적으로 관리하고 전체 브로드캐스트. 클라이언트는 수신한 상태를 Three.js Group 스케일/이동속도에 반영하며, 벽 충돌은 AABB-구체 교차(`Box3.intersectsSphere`)로 처리.

**Tech Stack:** Node.js + Socket.IO (서버), Three.js r160 + Vanilla JS (클라이언트)

---

### Task 1: HTML + CSS — 새 UI 요소 추가

**Files:**
- Modify: `leo_fps_game/index.html`
- Modify: `leo_fps_game/style.css`

---

- [ ] **Step 1: index.html에 #totalKills, #escalationMsg, #clearUI 추가**

`<div id="health">HP: 100</div>` 바로 아래에 추가:

```html
<div id="totalKills">총 킬: 0 / 160</div>
<div id="escalationMsg"></div>

<div id="clearUI">
  <div class="clear-content">
    <div class="clear-title">🎉 CLEAR!</div>
    <div class="clear-sub">160마리 처치 완료</div>
  </div>
</div>
```

- [ ] **Step 2: style.css에 새 요소 스타일 추가**

파일 맨 끝에 추가:

```css
/* 총 킬 카운터 */
#totalKills {
  position: fixed;
  top: 80px;
  left: 20px;
  color: #ffcc00;
  font-size: 18px;
  z-index: 10;
}

/* 에스컬레이션 알림 */
#escalationMsg {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -120px);
  color: #ff4400;
  font-size: 32px;
  font-weight: bold;
  opacity: 0;
  pointer-events: none;
  z-index: 50;
  text-shadow: 0 0 10px rgba(255,68,0,0.8);
  transition: opacity 0.3s ease;
}

/* 클리어 UI */
#clearUI {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.85);
  display: none;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.clear-content {
  text-align: center;
}

.clear-title {
  font-size: 80px;
  color: #ffcc00;
  text-shadow: 0 0 30px rgba(255,204,0,0.8);
  margin-bottom: 20px;
}

.clear-sub {
  font-size: 28px;
  color: white;
}
```

- [ ] **Step 3: 코드 검토 (브라우저 없이)**

index.html에 세 요소(#totalKills, #escalationMsg, #clearUI)가 있는지,
style.css에 네 블록이 있는지 확인.

- [ ] **Step 4: 커밋**

```bash
cd /Users/myeongjeonghyeonmyeongjeonghyeon/game_project
git add leo_fps_game/index.html leo_fps_game/style.css
git commit -m "feat: add totalKills HUD, escalation msg, clear UI"
```

---

### Task 2: 서버 전면 업데이트

**Files:**
- Modify: `multi_play_server/server.js`
- Modify: `multi_play_server/package.json`

---

- [ ] **Step 1: package.json에 type:module + start 스크립트 추가**

현재 내용을 아래로 교체:

```json
{
  "name": "fps-server",
  "version": "1.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.5"
  }
}
```

- [ ] **Step 2: server.js 전체 교체**

```js
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

  socket.on("killDog", (data) => {
    if(!dogs[data.id]) return;

    delete dogs[data.id];
    io.emit("removeDog", data.id);

    if(gameCleared) return;

    totalKills++;

    if(totalKills === 30)  dogScale = 2.0;
    if(totalKills === 90)  dogSpeed = 2.5;
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
  const id = "dog_" + dogId++;
  dogs[id] = {
    id,
    x: (Math.random()-0.5)*50,
    z: (Math.random()-0.5)*50
  };
  io.emit("spawnDog", dogs[id]);
}

setInterval(spawnDog, 3000);

server.listen(process.env.PORT || 3000);
```

- [ ] **Step 3: 코드 검토**

확인 사항:
- `killDog` 핸들러가 있는가
- `mapLayout` 이벤트가 join에서 emit되는가
- `getGameState()` 반환값에 `dogScale`, `dogSpeed` 포함되는가
- `setInterval(spawnDog, 3000)` (5000이 아님)

- [ ] **Step 4: 커밋**

```bash
cd /Users/myeongjeonghyeonmyeongjeonghyeon/game_project
git add multi_play_server/server.js multi_play_server/package.json
git commit -m "feat: server killDog handler, wallLayout, escalation, 3s respawn"
```

---

### Task 3: 클라이언트 — 상태 변수 + 소켓 이벤트

**Files:**
- Modify: `leo_fps_game/game.js`

---

- [ ] **Step 1: dogScale/dogSpeed 상태 변수 추가**

`let kills = 0;` 바로 아래에 추가:

```js
let dogScale = 1.0;
let dogSpeed = 1.0;
let prevDogScale = 1.0;
let prevDogSpeed = 1.0;
```

- [ ] **Step 2: showEscalationMsg 헬퍼 추가**

`updateDogHpBar` 함수 바로 아래에 추가:

```js
function showEscalationMsg(text){
  const el = document.getElementById("escalationMsg");
  if(!el) return;
  el.innerText = text;
  el.style.opacity = 1;
  setTimeout(()=>{ el.style.opacity = 0; }, 2000);
}
```

- [ ] **Step 3: 랜덤 벽 생성 코드 제거**

아래 코드를 찾아 삭제:

```js
for(let i=0;i<6;i++){
  createWall((Math.random()-0.5)*80,(Math.random()-0.5)*80);
}
```

삭제 후 그 자리에 주석만 남김:

```js
// 벽은 서버 mapLayout 이벤트로 생성됨
```

- [ ] **Step 4: mapLayout / gameState / gameClear 소켓 핸들러 추가**

기존 `socket.on("removePlayer", ...)` 핸들러 바로 아래에 추가:

```js
socket.on("mapLayout",(layout)=>{
  layout.forEach(w => createWall(w.x, w.z));
});

socket.on("gameState",(state)=>{
  const scaleChanged = state.dogScale > prevDogScale;
  const speedChanged = state.dogSpeed > prevDogSpeed;

  dogScale = state.dogScale;
  dogSpeed = state.dogSpeed;
  prevDogScale = state.dogScale;
  prevDogSpeed = state.dogSpeed;

  const el = document.getElementById("totalKills");
  if(el) el.innerText = "총 킬: " + state.totalKills + " / 160";

  // 이미 스폰된 강아지에도 새 스케일 적용
  Object.values(serverDogs).forEach(dog => {
    dog.scale.setScalar(dogScale);
  });

  if(scaleChanged) showEscalationMsg("강아지가 커졌다!");
  if(speedChanged) showEscalationMsg("강아지가 빨라졌다!");
});

socket.on("gameClear",()=>{
  const clearUI = document.getElementById("clearUI");
  if(clearUI) clearUI.style.display = "flex";
  gameStarted = false;
});
```

- [ ] **Step 5: 코드 검토**

확인 사항:
- `dogScale`, `dogSpeed`, `prevDogScale`, `prevDogSpeed` 선언 있는가
- `showEscalationMsg` 정의 있는가
- 랜덤 createWall 루프가 제거됐는가
- `mapLayout`, `gameState`, `gameClear` 핸들러 3개 모두 있는가

- [ ] **Step 6: 커밋**

```bash
cd /Users/myeongjeonghyeonmyeongjeonghyeon/game_project
git add leo_fps_game/game.js
git commit -m "feat: client dogScale/dogSpeed state + socket handlers"
```

---

### Task 4: 클라이언트 — 스케일/속도 적용 + 벽 충돌

**Files:**
- Modify: `leo_fps_game/game.js`

---

- [ ] **Step 1: spawnDog에서 dogScale 적용**

`socket.on("spawnDog", ...)` 핸들러 안에서 `group.userData.fillBar = fillBar;` 바로 아래에 추가:

```js
  group.scale.setScalar(dogScale);
```

- [ ] **Step 2: animate()에서 플레이어 이동 전 위치 저장 추가**

animate() 안에서 `if(move.w) controls.moveForward(0.2);` 바로 위에 추가:

```js
  const prevX = camera.position.x;
  const prevZ = camera.position.z;
```

- [ ] **Step 3: animate()에서 플레이어 이동 후 벽 충돌 추가**

`if(move.d) controls.moveRight(0.2);` 바로 아래에 추가:

```js
  // 플레이어 벽 충돌 (AABB)
  const playerSphere = new THREE.Sphere(camera.position.clone(), 1);
  for(const wall of walls){
    if(new THREE.Box3().setFromObject(wall).intersectsSphere(playerSphere)){
      camera.position.x = prevX;
      camera.position.z = prevZ;
      break;
    }
  }
```

- [ ] **Step 4: animate()에서 강아지 이동 코드를 속도 + 벽충돌 버전으로 교체**

아래 기존 코드를 찾아:

```js
    const dir = new THREE.Vector3(
      camera.position.x - dog.position.x,
      0,
      camera.position.z - dog.position.z
    ).normalize();
    dog.position.add(dir.multiplyScalar(0.05));
```

아래로 교체:

```js
    const dir = new THREE.Vector3(
      camera.position.x - dog.position.x,
      0,
      camera.position.z - dog.position.z
    ).normalize();
    const step = dir.clone().multiplyScalar(0.05 * dogSpeed);
    const nextDogPos = dog.position.clone().add(step);
    const dogSphere = new THREE.Sphere(nextDogPos, 1.5);
    let dogBlocked = false;
    for(const wall of walls){
      if(new THREE.Box3().setFromObject(wall).intersectsSphere(dogSphere)){
        dogBlocked = true;
        break;
      }
    }
    if(!dogBlocked) dog.position.add(step);
```

- [ ] **Step 5: 코드 검토**

확인 사항:
- `group.scale.setScalar(dogScale)` 가 spawnDog 안에 있는가
- `prevX`, `prevZ` 저장 후 플레이어 벽 충돌 체크가 있는가
- 강아지 이동에 `0.05 * dogSpeed`가 사용되는가
- `dogBlocked` 체크 후 조건부 이동인가

- [ ] **Step 6: 커밋**

```bash
cd /Users/myeongjeonghyeonmyeongjeonghyeon/game_project
git add leo_fps_game/game.js
git commit -m "feat: apply dogScale/dogSpeed + AABB wall collision"
```

---

### Task 5: GitHub 푸시

**Files:** 없음 (git 명령만)

---

- [ ] **Step 1: 리모트 추가**

```bash
cd /Users/myeongjeonghyeonmyeongjeonghyeon/game_project
git remote add origin https://github.com/mjheg/ha-project-build.git
```

- [ ] **Step 2: 현재 브랜치 확인**

```bash
git branch
```

Expected: `* main`

- [ ] **Step 3: 푸시**

```bash
git push -u origin main --force
```

`--force`를 사용하는 이유: 로컬 저장소가 방금 초기화되어 원격 히스토리와 관련이 없음.
Expected output: `Branch 'main' set up to track remote branch 'main' from 'origin'.`

- [ ] **Step 4: 푸시 확인**

```bash
git log --oneline
```

Expected: 5개의 커밋이 보여야 함.
