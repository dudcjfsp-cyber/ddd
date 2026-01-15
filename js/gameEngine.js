/**
 * gameEngine.js
 * 과일 받기 게임의 핵심 로직 (렌더링, 물리 엔진, 점수 관리)
 */

const GAME_STATE = {
  READY: 0,
  PLAYING: 1,
  GAMEOVER: 2
};

class Basket {
  constructor(canvasWidth, canvasHeight) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.width = 80;
    this.height = 80;
    this.x = (canvasWidth - this.width) / 2;
    this.y = canvasHeight - this.height - 10;
    this.targetX = this.x;
    this.emoji = "🧺";
    this.lerpFactor = 0.1; // 부드러운 움직임 계수
  }

  // 포즈 명령에 따라 목표 위치 설정
  move(command) {
    const sectionWidth = this.canvasWidth / 3;
    if (command === "Left") {
      this.targetX = sectionWidth / 2 - this.width / 2;
    } else if (command === "Center") {
      this.targetX = this.canvasWidth / 2 - this.width / 2;
    } else if (command === "Right") {
      this.targetX = sectionWidth * 2.5 - this.width / 2;
    }
  }

  update() {
    // 부드러운 이동 (Lerp)
    // 현재 위치 += (목표 위치 - 현재 위치) * 계수
    if (Math.abs(this.targetX - this.x) > 0.5) {
      this.x += (this.targetX - this.x) * this.lerpFactor;
    } else {
      this.x = this.targetX;
    }
  }

  draw(ctx) {
    ctx.font = "60px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.emoji, this.x + this.width / 2, this.y + this.height / 2);
  }
}

class FallingItem {
  constructor(canvasWidth, type) {
    this.canvasWidth = canvasWidth;

    // 무작위 x 위치 (3개 구역 중 하나)
    const sections = [1 / 6, 3 / 6, 5 / 6];
    const sectionIdx = Math.floor(Math.random() * 3);
    this.x = (this.canvasWidth * sections[sectionIdx]) - 25;
    this.y = -50;
    this.size = 50;

    this.type = type; // "Fruit" or "Bomb" or "Gold"
    this.speed = Math.random() * 2 + 3; // 기본 속도
    this.active = true;

    // 아이템 타입별 설정
    if (this.type === "Bomb") {
      this.emoji = "💣";
      this.score = 0; // 게임 오버 트리거
    } else if (this.type === "Gold") {
      this.emoji = "🍓";
      this.score = 300;
      this.speed *= 1.5;
    } else {
      this.emoji = Math.random() > 0.5 ? "🍎" : "🍌";
      this.score = this.emoji === "🍎" ? 100 : 200;
    }
  }

  update(levelSpeedMultiplier) {
    this.y += this.speed * levelSpeedMultiplier;
    // 화면 밖으로 나가면 비활성화
    if (this.y > 600) {
      this.active = false;
    }
  }

  draw(ctx) {
    ctx.font = "40px Arial";
    ctx.fillText(this.emoji, this.x + 25, this.y + 25);
  }
}

class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = GAME_STATE.READY;

    this.score = 0;
    this.level = 1;
    this.timeLeft = 60;

    this.basket = new Basket(canvas.width, canvas.height);
    this.items = [];
    this.lastSpawnTime = 0;
    this.spawnRate = 1500; // ms

    // Callbacks
    this.onScoreUpdate = null;
    this.onTimeUpdate = null;
    this.onGameOver = null;

    this.animationId = null;
    this.timerInterval = null;
  }

  init() {
    // 캔버스 크기 조정 (반응형 대응)
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    // 바구니 위치 재조정
    if (this.basket) {
      this.basket.canvasWidth = this.canvas.width;
      this.basket.canvasHeight = this.canvas.height;
      this.basket.y = this.canvas.height - 80 - 10;
      this.basket.x = (this.canvas.width - this.basket.width) / 2; // 중앙 리셋
      this.basket.targetX = this.basket.x;
    }
  }

  restart() {
    this.stop(); // 기존 타이머/루프 정리
    this.start();
  }

  start() {
    this.state = GAME_STATE.PLAYING;
    this.score = 0;
    this.level = 1;
    this.timeLeft = 60;
    this.items = [];
    this.basket = new Basket(this.canvas.width, this.canvas.height);
    this.spawnRate = 1500;

    if (this.onScoreUpdate) this.onScoreUpdate(this.score);
    if (this.onTimeUpdate) this.onTimeUpdate(this.timeLeft);

    this.loop();
    this.startTimer();
  }

  stop() {
    this.state = GAME_STATE.READY;
    cancelAnimationFrame(this.animationId);
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  inputCommand(command) {
    if (this.state === GAME_STATE.PLAYING) {
      this.basket.move(command);
    }
  }

  loop(timestamp) {
    // 1. Clear
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.state === GAME_STATE.PLAYING) {
      // 2. Spawn Items
      if (!this.lastSpawnTime) this.lastSpawnTime = timestamp;
      if (timestamp - this.lastSpawnTime > this.spawnRate) {
        this.spawnItem();
        this.lastSpawnTime = timestamp;
      }

      // 3. Update Entities
      this.basket.update();

      for (let i = this.items.length - 1; i >= 0; i--) {
        const item = this.items[i];
        const speedMult = 1 + (this.level - 1) * 0.1;
        item.update(speedMult);

        // 충돌 체크
        if (this.checkCollision(this.basket, item)) {
          this.handleItemCollection(item);
          this.items.splice(i, 1);
        } else if (!item.active || item.y > this.canvas.height) {
          this.items.splice(i, 1);
        }
      }
    } else if (this.state === GAME_STATE.GAMEOVER) {
      // 게임 오버 상태에서도 바구니는 움직이게 할지, 멈출지 결정 (여기선 멈춤)
      // 화면에 Game Over 텍스트 그리기
      this.drawGameOverScreen();
    }

    // 4. Draw (Always draw visible items)
    this.drawGuidelines();
    this.basket.draw(this.ctx);
    this.items.forEach(item => item.draw(this.ctx));

    // Loop
    if (this.state !== GAME_STATE.READY) {
      this.animationId = requestAnimationFrame(this.loop.bind(this));
    }
  }

  drawGuidelines() {
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([10, 10]);

    const oneThird = this.canvas.width / 3;

    this.ctx.beginPath();
    this.ctx.moveTo(oneThird, 0);
    this.ctx.lineTo(oneThird, this.canvas.height);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(oneThird * 2, 0);
    this.ctx.lineTo(oneThird * 2, this.canvas.height);
    this.ctx.stroke();

    this.ctx.setLineDash([]);
  }

  drawGameOverScreen() {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = "white";
    this.ctx.font = "40px 'Press Start 2P', sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText("GAME OVER", this.canvas.width / 2, this.canvas.height / 2 - 20);

    this.ctx.font = "20px 'Noto Sans KR', sans-serif";
    this.ctx.fillText(`최종 점수: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 30);
    this.ctx.fillText("스페이스바를 눌러 다시 시작", this.canvas.width / 2, this.canvas.height / 2 + 70);
  }

  spawnItem() {
    const rand = Math.random();
    let type = "Fruit";
    if (rand < 0.1 + (this.level * 0.02)) type = "Bomb";
    else if (rand > 0.8) type = "Gold";

    this.items.push(new FallingItem(this.canvas.width, type));
    this.spawnRate = Math.max(500, 1500 - (this.level * 100));
  }

  checkCollision(basket, item) {
    const itemCX = item.x + 25;
    const itemCY = item.y + 25;
    const basketCX = basket.x + basket.width / 2;
    const basketCY = basket.y + basket.height / 2;

    const dist = Math.sqrt(Math.pow(itemCX - basketCX, 2) + Math.pow(itemCY - basketCY, 2));
    return dist < (basket.width / 2 + item.size / 2 - 10);
  }

  handleItemCollection(item) {
    if (item.type === "Bomb") {
      this.gameOver();
    } else {
      this.score += item.score;
      const newLevel = Math.floor(this.score / 500) + 1;
      if (newLevel > this.level) {
        this.level = newLevel;
      }
      if (this.onScoreUpdate) this.onScoreUpdate(this.score);
    }
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.state !== GAME_STATE.PLAYING) return;

      this.timeLeft--;
      if (this.onTimeUpdate) this.onTimeUpdate(this.timeLeft);

      if (this.timeLeft <= 0) {
        this.gameOver();
      }
    }, 1000);
  }

  gameOver() {
    this.state = GAME_STATE.GAMEOVER;
    if (this.timerInterval) clearInterval(this.timerInterval);

    // HTML 오버레이 호출이 아닌, 캔버스 내부에 그리거나 상태만 변경
    if (this.onGameOver) this.onGameOver(this.score);
  }
}

window.GameEngine = GameEngine;
window.GAME_STATE = GAME_STATE;
