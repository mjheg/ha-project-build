# Projectile & Dog HP Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `leo_fps_game/game.js`에 날아가는 총알 메시(projectile)와 강아지 머리 위 HP 바(3발)를 추가한다.

**Architecture:** 기존 hitscan(즉시 Raycaster)을 제거하고 `projectiles` 배열로 교체. 매 프레임 bullet을 이동시키고 `distanceTo()`로 충돌 판정. 강아지는 `THREE.Plane` 단일 메시 → `THREE.Group`으로 변경하고 HP 바 자식 메시 2개(배경+전경)를 추가.

**Tech Stack:** Three.js r160, Vanilla JS, Browser-only (서버 변경 없음)

---

### Task 1: Dog HP 데이터 구조 + spawnDog Group 변환

**Files:**
- Modify: `leo_fps_game/game.js`

---

- [ ] **Step 1: `dogHp` 맵 선언 추가**

`serverDogs` 선언 바로 아래에 추가:

```js
const serverDogs = {};
const dogHp = {};      // ← 추가
```

파일 내 `const serverDogs = {};` 줄 다음에 삽입.

- [ ] **Step 2: `spawnDog` 핸들러를 Group 방식으로 교체**

기존 `socket.on("spawnDog", ...)` 블록 전체를 아래로 교체:

```js
socket.on("spawnDog",(data)=>{

  const group = new THREE.Group();

  // 강아지 스프라이트
  const sprite = new THREE.Mesh(
    new THREE.PlaneGeometry(4,4),
    new THREE.MeshBasicMaterial({ map: dogTexture, transparent: true })
  );
  group.add(sprite);

  // HP 바 배경 (어두운 빨강)
  const bgBar = new THREE.Mesh(
    new THREE.PlaneGeometry(2,0.3),
    new THREE.MeshBasicMaterial({ color: 0x550000 })
  );
  bgBar.position.set(0, 3, 0);
  group.add(bgBar);

  // HP 바 전경 (초록)
  const fillBar = new THREE.Mesh(
    new THREE.PlaneGeometry(2,0.3),
    new THREE.MeshBasicMaterial({ color: 0x00ff44 })
  );
  fillBar.position.set(0, 3, 0.01);
  group.add(fillBar);

  group.userData.fillBar = fillBar;
  group.position.set(data.x, 2, data.z);

  scene.add(group);
  serverDogs[data.id] = group;
  dogHp[data.id] = 3;
});
```

- [ ] **Step 3: `removeDog` 핸들러에 `dogHp` 정리 추가**

기존:
```js
socket.on("removeDog",(id)=>{

  const dog = serverDogs[id];

  if(dog){
    scene.remove(dog);
    delete serverDogs[id];
  }
});
```

교체:
```js
socket.on("removeDog",(id)=>{

  const dog = serverDogs[id];

  if(dog){
    scene.remove(dog);
    delete serverDogs[id];
    delete dogHp[id];
  }
});
```

- [ ] **Step 4: 브라우저에서 강아지 HP 바 확인**

```
python3 -m http.server 8080
# http://localhost:8080 열기
```

게임 시작 후 강아지 머리 위에 빨간 배경 + 초록 전경 HP 바가 보여야 함.

- [ ] **Step 5: 커밋**

```bash
cd /Users/myeongjeonghyeonmyeongjeonghyeon/game_project
git add leo_fps_game/game.js
git commit -m "feat: add dog HP bar with Group-based spawn"
```

---

### Task 2: `updateDogHpBar` 헬퍼 + Raycaster 제거 + Projectile 시스템

**Files:**
- Modify: `leo_fps_game/game.js`

---

- [ ] **Step 1: `updateDogHpBar` 헬퍼 함수 추가**

`showHitmarker` 함수 바로 아래에 추가:

```js
function updateDogHpBar(id){
  const dog = serverDogs[id];
  if(!dog) return;
  const fillBar = dog.userData.fillBar;
  if(!fillBar) return;
  const ratio = Math.max(0, dogHp[id] / 3);
  fillBar.scale.x = ratio;
  fillBar.position.x = ratio - 1; // 왼쪽 기준으로 줄어들게
}
```

- [ ] **Step 2: `projectiles` 배열 선언 추가**

`const serverDogs = {};` 선언 블록 근처에 추가:

```js
const projectiles = []; // { mesh, velocity, dist }
```

- [ ] **Step 3: `mousedown` 핸들러에서 Raycaster 판정 제거 후 발사체 생성으로 교체**

기존 `document.addEventListener("mousedown", ...)` 블록 전체를 아래로 교체:

```js
document.addEventListener("mousedown",()=>{

  if(!gameStarted) return;

  gunSound.currentTime = 0;
  gunSound.play();

  // 반동 애니메이션
  camera.rotation.x -= 0.05;
  setTimeout(()=>camera.rotation.x += 0.05, 100);

  // 발사체 생성
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffff00 })
  );
  bullet.position.copy(camera.position);
  scene.add(bullet);

  projectiles.push({
    mesh: bullet,
    velocity: dir.clone().multiplyScalar(2),
    dist: 0
  });
});
```

- [ ] **Step 4: `animate()` 루프에 발사체 업데이트 로직 추가**

`renderer.render(scene,camera);` 바로 앞에 삽입:

```js
  // 발사체 업데이트
  for(let i = projectiles.length - 1; i >= 0; i--){
    const p = projectiles[i];
    p.mesh.position.add(p.velocity);
    p.dist += 2;

    let hit = false;

    // 강아지 충돌
    for(const [id, dog] of Object.entries(serverDogs)){
      if(p.mesh.position.distanceTo(dog.position) < 1.5){
        dogHp[id]--;
        updateDogHpBar(id);
        if(dogHp[id] <= 0){
          socket.emit("killDog",{id});
        }
        showHitmarker();
        hit = true;
        break;
      }
    }

    // 플레이어 충돌
    if(!hit){
      for(const [id, player] of Object.entries(otherPlayers)){
        if(p.mesh.position.distanceTo(player.position) < 2){
          socket.emit("hit",{targetId:id});
          showHitmarker();
          hit = true;
          break;
        }
      }
    }

    // 충돌했거나 사거리 초과 시 제거
    if(hit || p.dist > 200){
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
```

- [ ] **Step 5: 브라우저에서 발사체 동작 확인**

```
python3 -m http.server 8080
```

1. 게임 시작 후 클릭 → 노란 구체가 카메라 방향으로 날아가야 함
2. 강아지 3번 맞히면 사망 + HP 바가 줄어야 함
3. HP 바가 0이 되면 강아지 사라져야 함

- [ ] **Step 6: 커밋**

```bash
cd /Users/myeongjeonghyeonmyeongjeonghyeon/game_project
git add leo_fps_game/game.js
git commit -m "feat: replace hitscan with projectile system"
```
