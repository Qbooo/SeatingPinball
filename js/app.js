/**
 * app.js
 * 전체 흐름 관리 (이름 파싱, 뷰 전환, 게임 진행)
 */

// ── 상태 ──────────────────────────────────────────────────
let names        = [];       // 입력된 이름 배열
let nameQueue    = [];       // 아직 발사 안 된 이름
let seatQueue    = [];       // 배정 대기 자리 번호 (순서대로)
let assigned     = 0;        // 배정 완료 수
let launchTimer  = null;
let isGameScreen = false;
let pinballLarge = true;     // true=핀볼 크게, false=자리표 크게

// ── DOMContentLoaded ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSeats();
  renderSetupSeatMap();
  bindSetupEvents();
});

// ── 이름 파싱 ─────────────────────────────────────────────
function parseNames(raw) {
  return raw
    .split(/[\s,，\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// ── 설정 화면 이벤트 ──────────────────────────────────────
function bindSetupEvents() {
  const input   = document.getElementById('name-input');
  const startBtn = document.getElementById('start-btn');

  input.addEventListener('input', () => {
    names = parseNames(input.value);
    renderNameTags();
    document.getElementById('name-count').textContent = `${names.length}명 입력됨`;
    startBtn.disabled = names.length === 0;
  });

  startBtn.addEventListener('click', startGame);
}

function renderNameTags() {
  const container = document.getElementById('name-tags');
  container.innerHTML = '';
  names.forEach(n => {
    const tag = document.createElement('span');
    tag.className = 'name-tag';
    tag.textContent = n;
    container.appendChild(tag);
  });
}

// ── 설정용 자리 배치표 렌더링 ─────────────────────────────
function renderSetupSeatMap() {
  const map = document.getElementById('setup-seat-map');
  map.innerHTML = '';

  const leftGroup  = document.createElement('div');
  const rightGroup = document.createElement('div');
  leftGroup.className  = 'seat-group left-group';
  rightGroup.className = 'seat-group right-group';

  for (let row = 1; row <= 4; row++) {
    const leftRow  = document.createElement('div');
    const rightRow = document.createElement('div');
    leftRow.className  = 'seat-row';
    rightRow.className = 'seat-row';

    SEAT_DEFS.filter(s => s.row === row && s.group === 'left').forEach(s => {
      leftRow.appendChild(makeSetupCell(s.id));
    });
    SEAT_DEFS.filter(s => s.row === row && s.group === 'right').forEach(s => {
      rightRow.appendChild(makeSetupCell(s.id));
    });

    leftGroup.appendChild(leftRow);
    rightGroup.appendChild(rightRow);
  }

  // 강사 자리
  const teacherWrap = document.createElement('div');
  teacherWrap.className = 'teacher-row';
  const teacherCell = document.createElement('div');
  teacherCell.className = 'seat teacher';
  teacherCell.textContent = '강사';
  teacherWrap.appendChild(teacherCell);

  map.appendChild(leftGroup);
  map.appendChild(rightGroup);
  map.appendChild(teacherWrap);
}

function makeSetupCell(id) {
  const cell = document.createElement('div');
  cell.className = 'seat';
  cell.dataset.id = id;
  cell.dataset.mode = 'normal';

  const numSpan  = document.createElement('span');
  numSpan.className = 'seat-num';
  numSpan.textContent = id;

  const nameInput = document.createElement('input');
  nameInput.className = 'seat-name-input';
  nameInput.placeholder = '이름';
  nameInput.type = 'text';

  // 이름 입력 후 엔터 또는 포커스 아웃 → 고정 설정
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const n = nameInput.value.trim();
      if (n) {
        setFixed(id, n);
        cell.dataset.mode = 'fixed';
        updateCellStyle(cell);
        nameInput.blur();
      }
    }
    e.stopPropagation();
  });
  nameInput.addEventListener('blur', () => {
    const n = nameInput.value.trim();
    if (n) {
      setFixed(id, n);
      cell.dataset.mode = 'fixed';
    } else if (cell.dataset.mode === 'fixed') {
      clearFixed(id);
      cell.dataset.mode = 'normal';
    }
    updateCellStyle(cell);
  });
  nameInput.addEventListener('click', e => e.stopPropagation());

  // 셀 클릭 → 제외 토글 (이름 없을 때만)
  cell.addEventListener('click', () => {
    const n = nameInput.value.trim();
    if (n) return;  // 이름 있으면 고정 모드
    toggleExclude(id);
    cell.dataset.mode = getSeatState(id).state;
    updateCellStyle(cell);
  });

  cell.appendChild(numSpan);
  cell.appendChild(nameInput);
  return cell;
}

function updateCellStyle(cell) {
  cell.classList.remove('excluded', 'fixed');
  if (cell.dataset.mode === 'excluded') cell.classList.add('excluded');
  if (cell.dataset.mode === 'fixed')    cell.classList.add('fixed');
}

// ── 게임 시작 ─────────────────────────────────────────────
function goHome() {
  Pinball.stop();
  clearInterval(launchTimer);
  launchTimer = null;
  isGameScreen = false;
  pinballLarge = true;
  assigned  = 0;
  nameQueue = [];
  seatQueue = [];

  // 화면 전환
  document.getElementById('game-screen').classList.remove('active');
  document.getElementById('setup-screen').classList.add('active');

  // 자리 상태 초기화
  initSeats();
  renderSetupSeatMap();

  // 이름 입력 초기화
  names = [];
  document.getElementById('name-input').value = '';
  document.getElementById('name-tags').innerHTML = '';
  document.getElementById('name-count').textContent = '0명 입력됨';
  document.getElementById('start-btn').disabled = true;

  // 진행 바 초기화
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('progress-label').textContent = '';
}

document.getElementById('home-btn').addEventListener('click', () => {
  if (confirm('홈으로 돌아가면 현재 게임이 초기화됩니다. 계속할까요?')) goHome();
});

function startGame() {
  const available = getAvailableSeatIds();
  const fixed     = getFixedSeats();

  // 이름 순서 랜덤 섞기
  nameQueue = [...names].sort(() => Math.random() - 0.5);

  // 고정 자리 수 + 일반 자리 수 = 배정 가능 자리
  // 이름 수가 배정 가능 수 초과 시 경고
  const totalSlots = available.length + fixed.length;
  if (names.length > totalSlots) {
    alert(`자리(${totalSlots}개)보다 이름(${names.length}명)이 많아요!\n자리를 늘리거나 이름을 줄여주세요.`);
    return;
  }

  seatQueue = [...available];  // 번호 순 (고정 자리 제외)

  // 화면 전환
  document.getElementById('setup-screen').classList.remove('active');
  const gameScreen = document.getElementById('game-screen');
  gameScreen.classList.add('active');
  isGameScreen = true;

  // 자리 배치표 (게임용) 렌더링
  renderGameSeatMap();

  // 핀볼 초기화 (레이아웃 확정 후 다음 프레임에 실행)
  const canvas = document.getElementById('pinball-canvas');
  requestAnimationFrame(() => {
    Pinball.init(canvas, onBallDrained);
    Pinball.start();
  });

  // 뷰 전환 이벤트
  bindViewToggle();

  // 발사 시작
  scheduleLaunch();

  // 상태 바
  updateProgress();
}

// ── 공 발사 스케줄 ────────────────────────────────────────
function scheduleLaunch() {
  if (nameQueue.length === 0) return;
  launchBatch();
  launchTimer = setInterval(() => {
    if (nameQueue.length === 0) {
      clearInterval(launchTimer);
      return;
    }
    launchBatch();
  }, 5000);
}

function launchBatch() {
  const batch = nameQueue.splice(0, 5);
  batch.forEach((name, i) => {
    setTimeout(() => Pinball.launchBall(name), i * 400);
  });
}

// ── 공 드레인 콜백 ────────────────────────────────────────
function onBallDrained(name) {
  if (seatQueue.length === 0) return;
  const seatId = seatQueue.shift();
  assignSeat(seatId, name);
  assigned++;
  updateGameSeatCell(seatId, name);
  updateProgress();

  // 모두 배정 완료
  if (seatQueue.length === 0 && nameQueue.length === 0) {
    setTimeout(() => {
      clearInterval(launchTimer);
      alert('🎉 자리 배정 완료!');
    }, 800);
  }
}

// ── 게임용 자리 배치표 렌더링 ─────────────────────────────
function renderGameSeatMap() {
  const map = document.getElementById('game-seat-map');
  map.innerHTML = '';

  const leftGroup  = document.createElement('div');
  const rightGroup = document.createElement('div');
  leftGroup.className  = 'seat-group left-group';
  rightGroup.className = 'seat-group right-group';

  for (let row = 1; row <= 4; row++) {
    const leftRow  = document.createElement('div');
    const rightRow = document.createElement('div');
    leftRow.className  = 'seat-row';
    rightRow.className = 'seat-row';

    SEAT_DEFS.filter(s => s.row === row && s.group === 'left').forEach(s => {
      leftRow.appendChild(makeGameCell(s.id));
    });
    SEAT_DEFS.filter(s => s.row === row && s.group === 'right').forEach(s => {
      rightRow.appendChild(makeGameCell(s.id));
    });

    leftGroup.appendChild(leftRow);
    rightGroup.appendChild(rightRow);
  }

  const teacherWrap = document.createElement('div');
  teacherWrap.className = 'teacher-row';
  const teacherCell = document.createElement('div');
  teacherCell.className = 'seat teacher';
  teacherCell.textContent = '강사';
  teacherWrap.appendChild(teacherCell);

  map.appendChild(leftGroup);
  map.appendChild(rightGroup);
  map.appendChild(teacherWrap);
}

function makeGameCell(id) {
  const s    = getSeatState(id);
  const cell = document.createElement('div');
  cell.className = 'seat game-seat';
  cell.id = `game-seat-${id}`;

  const numSpan  = document.createElement('span');
  numSpan.className = 'seat-num';
  numSpan.textContent = id;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'seat-name';

  if (s.state === 'fixed') {
    cell.classList.add('fixed');
    nameSpan.textContent = s.name;
  } else if (s.state === 'excluded') {
    cell.classList.add('excluded');
    numSpan.textContent = '';
  }

  cell.appendChild(numSpan);
  cell.appendChild(nameSpan);
  return cell;
}

function updateGameSeatCell(id, name) {
  const cell = document.getElementById(`game-seat-${id}`);
  if (!cell) return;
  cell.classList.add('assigned', 'pop');
  cell.querySelector('.seat-name').textContent = name;
  setTimeout(() => cell.classList.remove('pop'), 500);
}

// ── 뷰 전환 ──────────────────────────────────────────────
function bindViewToggle() {
  const pinballCont = document.getElementById('pinball-container');
  const seatCont    = document.getElementById('seat-container');
  const rotateBtn   = document.getElementById('rotate-btn');
  const seatMap     = document.getElementById('game-seat-map');

  seatCont.addEventListener('click', () => {
    if (pinballLarge) {
      pinballCont.classList.replace('view-large', 'view-small');
      seatCont.classList.replace('view-small', 'view-large');
      pinballLarge = false;
    }
  });

  pinballCont.addEventListener('click', () => {
    if (!pinballLarge) {
      pinballCont.classList.replace('view-small', 'view-large');
      seatCont.classList.replace('view-large', 'view-small');
      pinballLarge = true;
    }
  });

  // 180도 회전 버튼
  rotateBtn.addEventListener('click', e => {
    e.stopPropagation();  // 자리표 크기 전환 이벤트 막기
    const rotated = seatMap.classList.toggle('rotated');
    rotateBtn.textContent = rotated ? '↺ 원래대로' : '↻ 회전';
  });
}

// ── 진행 상태 ─────────────────────────────────────────────
function updateProgress() {
  const total = seatQueue.length + assigned;
  const pct   = total > 0 ? (assigned / total * 100) : 0;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-label').textContent =
    `${assigned} / ${total} 배정 완료`;
}
