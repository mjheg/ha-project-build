# Multiplayer Escalation + Walls Design

Date: 2026-03-27

## Scope

- `multi_play_server/server.js` — 서버 로직 수정
- `leo_fps_game/game.js` — 클라이언트 로직 수정
- `leo_fps_game/index.html` — UI 요소 추가
- 구현 완료 후 `https://github.com/mjheg/ha-project-build` 에 push

## 요구사항

1. 강아지가 HP 0이 되면 실제로 죽음 (서버에서 `killDog` 처리)
2. 강아지 3초마다 리스폰 (5000ms → 3000ms)
3. 공유 킬카운터: 모든 플레이어 킬 합산
4. 30킬 달성 → 강아지 크기 2배 (전체 플레이어 적용)
5. 90킬 달성 → 강아지 이동속도 2.5배 (전체 플레이어 적용)
6. 160킬 달성 → 클리어 메세지 (전체 플레이어)
7. 벽: 서버가 랜덤 위치 10개 생성, 모든 클라이언트에 동일하게 전달
8. 벽 충돌: 플레이어 + 강아지 모두 통과 불가

## 서버 설계 (`multi_play_server/server.js`)

### 새 전역 상태
```js
let totalKills = 0;
let dogScale = 1.0;
let dogSpeed = 1.0;
let gameCleared = false;
const wallLayout = []; // { x, z } 10개, 서버 시작 시 생성
```

### 벽 레이아웃 생성 (서버 시작 시 1회)
```js
for(let i = 0; i < 10; i++){
  wallLayout.push({
    x: (Math.random()-0.5)*80,
    z: (Math.random()-0.5)*80
  });
}
```

### `join` 핸들러 추가 전송
- `wallLayout` (맵 레이아웃)
- 현재 `gameState` (늦게 접속한 플레이어 동기화)

### `killDog` 핸들러 (신규)
```
1. dogs[id] 삭제
2. io.emit("removeDog", id)
3. totalKills++
4. 마일스톤 체크 → dogScale/dogSpeed 업데이트
5. io.emit("gameState", { totalKills, dogScale, dogSpeed })
6. 160킬 달성 시 io.emit("gameClear")
```

### `spawnDog` 인터벌
- 5000ms → 3000ms

## 클라이언트 설계 (`leo_fps_game/game.js`)

### 제거
- 클라이언트 랜덤 벽 생성 코드 (6개 랜덤 createWall)

### 추가 상태
```js
let dogScale = 1.0;
let dogSpeed = 1.0;
```

### 소켓 이벤트 수신
- `mapLayout`: 서버 벽 좌표로 createWall 호출
- `gameState`: dogScale, dogSpeed, totalKills 업데이트 → HUD 갱신, 알림 표시
- `gameClear`: 클리어 UI 표시

### 강아지 스케일 적용
- `spawnDog` 수신 시: `group.scale.setScalar(dogScale)` 적용
- `gameState` 수신 시: 기존 모든 serverDogs에도 `group.scale.setScalar(dogScale)` 재적용

### 강아지 속도 적용
- animate 루프에서 `dir.multiplyScalar(0.05 * dogSpeed)`

### 벽 충돌 — 플레이어 (AABB)
- 매 프레임 walls 배열 순회
- 카메라 position과 벽 Box3 겹침 검사
- 겹치면 이동 방향 반대로 밀어냄

### 벽 충돌 — 강아지 (AABB)
- 강아지 이동 전 다음 위치 계산
- 벽과 겹치면 해당 축 이동 취소

## UI (`leo_fps_game/index.html`)

| 요소 | ID | 내용 |
|------|----|------|
| 공유 킬 카운터 | `#totalKills` | `총 킬: 45 / 160` |
| 에스컬레이션 알림 | `#escalationMsg` | 2초간 표시 후 사라짐 |
| 클리어 화면 | `#clearUI` | 전체화면 오버레이 |

## 데이터 흐름

```
플레이어 총알 → dogHp 0 → socket.emit("killDog", {id})
서버: dogs 삭제 → totalKills++ → 마일스톤 체크
→ io.emit("removeDog", id)
→ io.emit("gameState", {totalKills, dogScale, dogSpeed})
→ [160킬] io.emit("gameClear")
모든 클라이언트: 강아지 제거 + 상태 반영 + UI 갱신
서버 3초 후: spawnDog → io.emit("spawnDog", data) → 모든 클라이언트 강아지 스폰
```

## GitHub
- Remote: `https://github.com/mjheg/ha-project-build`
- 구현 완료 후 push
