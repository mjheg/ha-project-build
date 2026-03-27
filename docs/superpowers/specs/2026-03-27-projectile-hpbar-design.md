# Projectile & HP Bar Design

Date: 2026-03-27

## Scope

`leo_fps_game/game.js` 단일 파일 수정. 서버 변경 없음.

## 1. Projectile System

**현재 방식:** `mousedown` 즉시 Raycaster hitscan → 제거

**새 방식:**
- 클릭 시 `THREE.Mesh(SphereGeometry(0.1), MeshBasicMaterial({color:0xffff00}))` 생성
- `projectiles` 배열에 `{mesh, velocity}` 저장
- `animate()` 루프에서 매 프레임:
  - `mesh.position.add(velocity)` (속도: 카메라 방향 × 2)
  - 강아지/플레이어와 `distanceTo() < 1` 충돌 체크
  - 충돌 시: 기존 hit 로직 실행 + projectile 제거
  - 200 units 초과 시 제거

## 2. Dog HP Bar

**클라이언트 HP 추적:**
- `dogHp = {}` — spawnDog 이벤트 시 3으로 초기화

**강아지 구조 변경:**
- 기존: `Plane` 단일 메시
- 변경: `THREE.Group` (sprite + HP bar)

**HP Bar:**
- 배경: `PlaneGeometry(2, 0.3)`, `MeshBasicMaterial({color:0x550000})`
- 전경: `PlaneGeometry(2, 0.3)`, `MeshBasicMaterial({color:0x00ff44})`
- 위치: dog 위 y=3
- 피격 시 전경 바 `scale.x = hp / 3`
- HP 0 → 기존 removeDog 처리

## Data Flow

```
mousedown
  → spawn projectile

animate() 매 프레임
  → projectile.position += velocity
  → distanceTo(dog) < 1 ?
      → dogHp[id]--
      → update HP bar scale
      → dogHp[id] === 0 → socket.emit("killDog")
  → distanceTo(player) < 1 ?
      → socket.emit("hit")
  → distance > 200 → remove
```
