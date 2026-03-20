/**
 * seats.js
 * 자리 배치 데이터 정의 및 상태 관리
 *
 * 번호 규칙: 아래→위, 왼쪽→오른쪽 (같은 행끼리 묶음)
 * 행 4(맨아래): 1~4(왼),  5~8(오)
 * 행 3:         9~12(왼), 13~16(오)
 * 행 2:        17~20(왼), 21~24(오)
 * 행 1(맨위):  25~28(왼), 29~32(오)   ← 총 32자리 (좌16 + 우16)
 */

// ── 자리 정의 ──────────────────────────────────────────────
// row: 1=맨위 ~ 4=맨아래 / col: 1=왼쪽부터 / group: 'left'|'right'
const SEAT_DEFS = [
  // 행4 왼쪽 (1~4)
  { id: 1,  row: 4, col: 1, group: 'left'  },
  { id: 2,  row: 4, col: 2, group: 'left'  },
  { id: 3,  row: 4, col: 3, group: 'left'  },
  { id: 4,  row: 4, col: 4, group: 'left'  },
  // 행4 오른쪽 (5~8)
  { id: 5,  row: 4, col: 1, group: 'right' },
  { id: 6,  row: 4, col: 2, group: 'right' },
  { id: 7,  row: 4, col: 3, group: 'right' },
  { id: 8,  row: 4, col: 4, group: 'right' },
  // 행3 왼쪽 (9~12)
  { id: 9,  row: 3, col: 1, group: 'left'  },
  { id: 10, row: 3, col: 2, group: 'left'  },
  { id: 11, row: 3, col: 3, group: 'left'  },
  { id: 12, row: 3, col: 4, group: 'left'  },
  // 행3 오른쪽 (13~16)
  { id: 13, row: 3, col: 1, group: 'right' },
  { id: 14, row: 3, col: 2, group: 'right' },
  { id: 15, row: 3, col: 3, group: 'right' },
  { id: 16, row: 3, col: 4, group: 'right' },
  // 행2 왼쪽 (17~20)
  { id: 17, row: 2, col: 1, group: 'left'  },
  { id: 18, row: 2, col: 2, group: 'left'  },
  { id: 19, row: 2, col: 3, group: 'left'  },
  { id: 20, row: 2, col: 4, group: 'left'  },
  // 행2 오른쪽 (21~24)
  { id: 21, row: 2, col: 1, group: 'right' },
  { id: 22, row: 2, col: 2, group: 'right' },
  { id: 23, row: 2, col: 3, group: 'right' },
  { id: 24, row: 2, col: 4, group: 'right' },
  // 행1 왼쪽 (25~28)
  { id: 25, row: 1, col: 1, group: 'left'  },
  { id: 26, row: 1, col: 2, group: 'left'  },
  { id: 27, row: 1, col: 3, group: 'left'  },
  { id: 28, row: 1, col: 4, group: 'left'  },
  // 행1 오른쪽 (29~32, 4칸 — 좌우 동일 16자리)
  { id: 29, row: 1, col: 1, group: 'right' },
  { id: 30, row: 1, col: 2, group: 'right' },
  { id: 31, row: 1, col: 3, group: 'right' },
  { id: 32, row: 1, col: 4, group: 'right' },
];

// ── 자리 상태 ──────────────────────────────────────────────
// state: 'normal' | 'excluded' | 'fixed' | 'assigned'
const seatStates = {};  // { id: { state, name } }

function initSeats() {
  SEAT_DEFS.forEach(s => {
    seatStates[s.id] = { state: 'normal', name: '' };
  });
}

function getSeatState(id) { return seatStates[id]; }

function toggleExclude(id) {
  const s = seatStates[id];
  if (s.state === 'excluded') s.state = 'normal';
  else if (s.state === 'normal') s.state = 'excluded';
}

function setFixed(id, name) {
  seatStates[id] = { state: 'fixed', name };
}

function clearFixed(id) {
  seatStates[id] = { state: 'normal', name: '' };
}

function assignSeat(id, name) {
  seatStates[id] = { state: 'assigned', name };
}

/** 게임에 참여할 자리 번호 목록 (excluded, fixed 제외, 번호순) */
function getAvailableSeatIds() {
  return SEAT_DEFS
    .map(s => s.id)
    .filter(id => seatStates[id].state === 'normal');
}

/** 고정 배정 자리 목록 */
function getFixedSeats() {
  return SEAT_DEFS
    .map(s => s.id)
    .filter(id => seatStates[id].state === 'fixed')
    .map(id => ({ id, name: seatStates[id].name }));
}
