import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";
const socket = io("https://ha-project-build.onrender.com");

import * as THREE from 'three';
import { PointerLockControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/PointerLockControls.js';


// =======================
// 🔥 추가 기능
// =======================
function showHitmarker(){
  const hit = document.getElementById("hitmarker");
  if(!hit) return;

  hit.style.opacity = 1;

  setTimeout(()=>{
    hit.style.opacity = 0;
  },120);
}

let selectedCharacter = 1;
let shakeTime = 0;
let revivalTimer = null;

let nickname = "";
let gameStarted = false;

let health = 100;
let kills = 0;
let dogScale = 1.0;
let dogSpeed = 1.0;
let prevDogScale = 1.0;
let prevDogSpeed = 1.0;

const otherPlayers = {};
const enemies = [];
const walls = [];
const wallBoxes = []; // precomputed Box3 for each wall (index matches walls[])
const serverDogs = {};
const dogHp = {}; // tracks remaining HP per dog id
const projectiles = []; // { mesh, velocity, dist }
const bulletGeo = new THREE.SphereGeometry(0.1, 6, 6);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });

function updateDogHpBar(id){
  const dog = serverDogs[id];
  if(!dog) return;
  const fillBar = dog.userData.fillBar;
  if(!fillBar) return;
  const ratio = Math.max(0, dogHp[id] / 3);
  fillBar.scale.x = ratio;
  fillBar.position.x = ratio - 1; // 왼쪽 기준으로 줄어들게
}

let escalationTimer = null;
function showEscalationMsg(text){
  const el = document.getElementById("escalationMsg");
  if(!el) return;
  el.innerText = text;
  el.style.opacity = 1;
  clearTimeout(escalationTimer);
  escalationTimer = setTimeout(()=>{ el.style.opacity = 0; }, 2000);
}

let velocityY = 0;
let isJumping = false;

// 🔊 사운드
const gunSound = new Audio("./gun.mp3");
gunSound.volume = 0.4;

const dogSound = new Audio("./dog.mp3");
dogSound.loop = true;
dogSound.volume = 0;

// =======================
// DOM
// =======================
window.addEventListener("DOMContentLoaded", () => {

  let selectedCharacter = null;

  document.querySelectorAll("#characterSelect button").forEach(btn=>{
    btn.addEventListener("click",()=>{

      selectedCharacter = btn.dataset.type;

      document.querySelectorAll("#characterSelect button").forEach(b=>{
        b.classList.remove("active");
      });

      btn.classList.add("active");
    });
  });

  const startBtn = document.getElementById("startBtn");
  const input = document.getElementById("nicknameInput");
  const nicknameUI = document.getElementById("nicknameUI");

  startBtn.addEventListener("click", () => {

    nickname = input.value.trim() || "Player";

    if(!selectedCharacter){
      selectedCharacter = "default"; // 🔥 기본 캐릭터
    }

    nicknameUI.style.display = "none";

    socket.emit("join", { 
      nickname,
      character: selectedCharacter 
    });

    controls.lock();
    dogSound.play();

    gameStarted = true;
  });
});

// =======================
// scene
// =======================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcccccc);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight,1,1000);
camera.position.set(0,5,0);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff,0x444444));

// ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200,200),
  new THREE.MeshStandardMaterial({color:0x999999})
);
ground.rotation.x = -Math.PI/2;
scene.add(ground);

// =======================
// gun
// =======================
const gun = new THREE.Mesh(
  new THREE.BoxGeometry(1,0.5,3),
  new THREE.MeshStandardMaterial({color:0x333333})
);
gun.position.set(1,-1,-3);
camera.add(gun);
scene.add(camera);

// =======================
// controls
// =======================
const controls = new PointerLockControls(camera, document.body);

// =======================
// 벽
// =======================
function createWall(x,z){
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(10,5,1),
    new THREE.MeshStandardMaterial({color:0x222222})
  );
  wall.position.set(x,2.5,z);
  scene.add(wall);
  walls.push(wall);
  wallBoxes.push(new THREE.Box3().setFromObject(wall));
}

// 벽은 서버 mapLayout 이벤트로 생성됨

// =======================
// 🐶 강아지
// =======================
const dogTexture = new THREE.TextureLoader().load('./dog.png');





// =======================
// 플레이어
// =======================
function createPlayer(data){

  const group = new THREE.Group();

  // 🔥 항상 파란 박스 플레이어
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2,4,2),
    new THREE.MeshStandardMaterial({color:0x0066ff})
  );

  body.position.set(0,2,0);
  group.add(body);

  // ======================
  // 이름 라벨 (기존 유지)
  // ======================
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = 256;
  canvas.height = 64;

  ctx.fillStyle = "white";
  ctx.font = "24px Arial";
  ctx.fillText(data.nickname, 10, 40);

  const texture = new THREE.CanvasTexture(canvas);

  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture })
  );

  label.position.set(0,5,0);
  label.scale.set(4,1.2,1);

  group.add(label);

  scene.add(group);
  otherPlayers[data.id] = group;
}

// =======================
// 멀티
// =======================
socket.on("currentPlayers",(players)=>{
  Object.keys(players).forEach(id=>{
    if(id!==socket.id && !otherPlayers[id]){ // 🔥 이 부분 추가
      createPlayer(players[id]);
    }
  });
});

socket.on("newPlayer",(data)=>{

  if(otherPlayers[data.id]) return; // 🔥 이 줄 추가

  createPlayer(data);
});

socket.on("playerMove",(data)=>{
  if(otherPlayers[data.id]){
    otherPlayers[data.id].position.set(data.x,2,data.z);
  }
});

socket.on("spawnDog",(data)=>{

  if(serverDogs[data.id]){
    scene.remove(serverDogs[data.id]);
    delete serverDogs[data.id];
    delete dogHp[data.id];
  }

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
  group.scale.setScalar(dogScale);
  group.position.set(data.x, 2, data.z);

  scene.add(group);
  serverDogs[data.id] = group;
  dogHp[data.id] = 3;
});

socket.on("removeDog",(id)=>{

  const dog = serverDogs[id];

  if(dog){
    scene.remove(dog);
    dog.children.forEach(child=>{
      if(child.geometry) child.geometry.dispose();
      if(child.material) child.material.dispose();
    });
    delete serverDogs[id];
    delete dogHp[id];
  }
});

socket.on("removePlayer",(id)=>{
  if(otherPlayers[id]){
    scene.remove(otherPlayers[id]);
    delete otherPlayers[id];
  }
});

socket.on("mapLayout",(layout)=>{
  if(walls.length > 0) return; // 이미 벽이 생성됐으면 무시
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
  clearTimeout(revivalTimer);  // ← 추가
  const clearUI = document.getElementById("clearUI");
  if(clearUI) clearUI.style.display = "flex";
  gameStarted = false;
});

// 서버 재시작/재연결 시 stale 강아지 상태 초기화
socket.on("connect", () => {
  Object.keys(serverDogs).forEach(id => {
    const dog = serverDogs[id];
    if(dog) {
      scene.remove(dog);
      dog.children.forEach(c => {
        if(c.geometry) c.geometry.dispose();
        if(c.material) c.material.dispose();
      });
    }
    delete serverDogs[id];
    delete dogHp[id];
  });
  if(gameStarted) {
    socket.emit("join", { nickname });
  }
});

// 🔥 수정된 playerDead
socket.on("playerDead",(data)=>{

  if(data.id === socket.id){
    health = 100;
    document.getElementById("health").innerText = "HP: 100";
    camera.position.set(0,5,0);
  }

  if(data.killer === socket.id){
    kills++;
    document.getElementById("score").innerText = "Kills: " + kills;
  }
});

// 🔥 수정된 playerHit (통합)
socket.on("playerHit",(data)=>{

  if(data.id === socket.id){

    health = Math.max(0, data.hp);

    document.getElementById("health").innerText =
      "HP: " + Math.floor(health);

    document.body.style.background = "rgba(255,0,0,0.4)";

    setTimeout(()=>{
      document.body.style.background = "black";
    },100);

    shakeTime = 10;
  }
});

// =======================
// 이동 + 점프 (한글 대응)
// =======================
const move = {w:false,s:false,a:false,d:false};

document.addEventListener("keydown",(e)=>{

  const key = e.key.toLowerCase();

  if(key==="w" || key==="ㅈ") move.w=true;
  if(key==="s" || key==="ㄴ") move.s=true;
  if(key==="a" || key==="ㅁ") move.a=true;
  if(key==="d" || key==="ㅇ") move.d=true;

  if(e.key===" " && !isJumping){
    velocityY = 0.3;
    isJumping = true;
  }
});

document.addEventListener("keyup",(e)=>{

  const key = e.key.toLowerCase();

  if(key==="w" || key==="ㅈ") move.w=false;
  if(key==="s" || key==="ㄴ") move.s=false;
  if(key==="a" || key==="ㅁ") move.a=false;
  if(key==="d" || key==="ㅇ") move.d=false;
});

// =======================
// 총
// =======================
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

  const bullet = new THREE.Mesh(bulletGeo, bulletMat);
  bullet.position.copy(camera.position);
  scene.add(bullet);

  projectiles.push({
    mesh: bullet,
    velocity: dir.clone().multiplyScalar(2),
    dist: 0
  });
});

let lastSend = 0;

// =======================
// 루프
// =======================
function animate(){
  requestAnimationFrame(animate);

  if(!gameStarted){
    renderer.render(scene,camera);
    return;
  }

  const prevX = camera.position.x;
  const prevZ = camera.position.z;
  if(move.w) controls.moveForward(0.2);
  if(move.s) controls.moveForward(-0.2);
  if(move.a) controls.moveRight(-0.2);
  if(move.d) controls.moveRight(0.2);

  // 플레이어 벽 충돌 (AABB)
  const playerSphere = new THREE.Sphere(camera.position.clone(), 1);
  for(const box of wallBoxes){
    if(box.intersectsSphere(playerSphere)){
      camera.position.x = prevX;
      camera.position.z = prevZ;
      break;
    }
  }

  velocityY -= 0.01;
  camera.position.y += velocityY;

  if(camera.position.y <= 5){
    camera.position.y = 5;
    velocityY = 0;
    isJumping = false;
  }

  if(shakeTime > 0){
    camera.position.x += (Math.random()-0.5)*0.2;
    camera.position.y += (Math.random()-0.5)*0.2;
    shakeTime--;
  }

  let closest = 999;

  Object.values(serverDogs).forEach(dog => {

    dog.lookAt(camera.position);

    const dx = camera.position.x - dog.position.x;
    const dz = camera.position.z - dog.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);

    const dir = new THREE.Vector3(
      camera.position.x - dog.position.x,
      0,
      camera.position.z - dog.position.z
    ).normalize();
    const step = dir.clone().multiplyScalar(0.05 * dogSpeed);
    const nextDogPos = dog.position.clone().add(step);
    const dogSphere = new THREE.Sphere(nextDogPos, 1.5);
    let dogBlocked = false;
    for(const box of wallBoxes){
      if(box.intersectsSphere(dogSphere)){
        dogBlocked = true;
        break;
      }
    }
    if(!dogBlocked) dog.position.add(step);

    if(dist < 2 * dogScale && health > 0){

      health -= 0.1;

      document.getElementById("health").innerText =
        "HP: " + Math.max(0, Math.floor(health));

      if(health <= 0){

        health = 0;
        document.getElementById("health").innerText = "HP: 0";

        const deadUI = document.getElementById("deadUI");

        if(deadUI){
          deadUI.style.display = "flex";
        }

        gameStarted = false;

        revivalTimer = setTimeout(()=>{

          if(deadUI){
            deadUI.style.display = "none";
          }

          health = 100;
          document.getElementById("health").innerText = "HP: 100";

          camera.position.set(0,5,0);

          gameStarted = true;

        },3000);
      }
    }

    if(dist < closest) closest = dist;
  });

  let vol = 1 - (closest / 20);
  dogSound.volume = Math.max(0, Math.min(1, vol));

  
  const now = Date.now();

  if(now - lastSend > 50){
    socket.emit("move",{
      x:camera.position.x,
      z:camera.position.z
    });
    lastSend = now;
  }
  // 발사체 업데이트
  for(let i = projectiles.length - 1; i >= 0; i--){
    const p = projectiles[i];
    p.mesh.position.add(p.velocity);
    p.dist += 2;

    let hit = false;

    // 강아지 충돌
    for(const [id, dog] of Object.entries(serverDogs)){
      if(!(dogHp[id] > 0)) continue; // skip dead or NaN/undefined HP dogs
      const bDx = p.mesh.position.x - dog.position.x;
      const bDz = p.mesh.position.z - dog.position.z;
      if(Math.sqrt(bDx*bDx + bDz*bDz) < 1.5 * dogScale){
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

  renderer.render(scene,camera);
}

animate();