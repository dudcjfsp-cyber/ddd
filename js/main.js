/**
 * main.js
 * 포즈 인식과 게임 로직을 초기화하고 서로 연결하는 진입점
 */

let poseEngine;
let gameEngine;
let stabilizer;
let ctx; // Webcam canvas context
let labelContainer;

// UI Elements
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const levelEl = document.getElementById("level");
const overlay = document.getElementById("game-overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayMessage = document.getElementById("overlay-message");
const startBtn = document.getElementById("startBtn");

async function init() {
  startBtn.disabled = true;
  startBtn.innerText = "Loading...";

  try {
    // 1. PoseEngine 초기화 (한 번만 로드)
    if (!poseEngine) {
      poseEngine = new PoseEngine("./my_model/");
      const { maxPredictions, webcam } = await poseEngine.init({
        size: 200,
        flip: true
      });

      // Webcam Canvas 설정
      const canvas = document.getElementById("canvas");
      canvas.width = 200;
      canvas.height = 200;
      ctx = canvas.getContext("2d");

      // Label Container 설정
      labelContainer = document.getElementById("label-container");
      labelContainer.innerHTML = "";
      for (let i = 0; i < maxPredictions; i++) {
        labelContainer.appendChild(document.createElement("div"));
      }

      // Stabilizer 초기화
      stabilizer = new PredictionStabilizer({
        threshold: 0.7,
        smoothingFrames: 3
      });

      // PoseEngine 콜백
      poseEngine.setPredictionCallback(handlePrediction);
      poseEngine.setDrawCallback(drawPose);

      poseEngine.start();
    }

    // 2. GameEngine 초기화
    if (!gameEngine) {
      const gameCanvas = document.getElementById("game-canvas");
      gameEngine = new GameEngine(gameCanvas);

      // Callbacks 연결
      gameEngine.onScoreUpdate = (score) => {
        scoreEl.innerText = score;
        levelEl.innerText = gameEngine.level;
      };

      gameEngine.onTimeUpdate = (time) => {
        timeEl.innerText = time;
      };

      gameEngine.onGameOver = (finalScore) => {
        // 이제 오버레이를 띄우지 않고 캔버스 내부에서 처리함 (하지만 로그는 남김)
        console.log("Game Over:", finalScore);
        // 필요 시 오버레이를 제거하거나, startBtn 상태 변경
        // startBtn.innerText = "Replay (Space)";
        // startBtn.disabled = false;
      };

      gameEngine.init();
    }

    // 키보드 이벤트 (재시작)
    window.addEventListener("keydown", (e) => {
      if (gameEngine && gameEngine.state === GAME_STATE.GAMEOVER) {
        if (e.code === "Space" || e.code === "Enter") {
          gameEngine.restart();
        }
      }
    });

    // 게임 시작
    startGame();

  } catch (error) {
    console.error("초기화 중 오류 발생:", error);
    alert("초기화에 실패했습니다. 콘솔을 확인하세요.");
    startBtn.disabled = false;
    startBtn.innerText = "Game Start";
  }
}

function startGame() {
  overlay.classList.add("hidden");
  gameEngine.start();
}

function showGameOver(score) {
  // Legacy: gameEngine 내부 드로잉으로 대체됨
  // overlayTitle.innerText = "GAME OVER";
  // overlayMessage.innerText = `최종 점수: ${score}점`;
  // startBtn.innerText = "Replay";
  // startBtn.disabled = false;
  // overlay.classList.remove("hidden");
}

function stop() {
  // Dev only
  if (gameEngine) gameEngine.stop();
  if (poseEngine) poseEngine.stop();
}

function handlePrediction(predictions, pose) {
  // 1. Stabilizer로 예측 안정화
  const stabilized = stabilizer.stabilize(predictions);

  // 2. Label Container 업데이트 (Debug)
  for (let i = 0; i < predictions.length; i++) {
    const classPrediction =
      predictions[i].className + ": " + predictions[i].probability.toFixed(2);
    labelContainer.childNodes[i].innerHTML = classPrediction;
  }

  // 3. 최고 확률 예측 표시
  const maxPredictionDiv = document.getElementById("max-prediction");
  maxPredictionDiv.innerHTML = stabilized.className || "감지 중...";

  // 4. GameEngine에 포즈 전달
  // 모델 클래스 이름이 "Left", "Center", "Right" 라고 가정 (또는 한국어 매핑 필요)
  // 사용자의 모델 클래스명에 따라 조건문 수정 필요할 수 있음
  if (gameEngine && gameEngine.state === GAME_STATE.PLAYING && stabilized.className) {
    // 한국어 라벨을 게임 커맨드로 변환
    let command = stabilized.className;
    if (command === "왼쪽기울이기" || command === "왼쪽") command = "Left";
    else if (command === "정면" || command === "차렷") command = "Center";
    else if (command === "오른쪽" || command === "오른쪽기울이기") command = "Right";

    gameEngine.inputCommand(command);
  }
}

function drawPose(pose) {
  if (poseEngine.webcam && poseEngine.webcam.canvas) {
    ctx.drawImage(poseEngine.webcam.canvas, 0, 0);

    if (pose) {
      const minPartConfidence = 0.5;
      tmPose.drawKeypoints(pose.keypoints, minPartConfidence, ctx);
      tmPose.drawSkeleton(pose.keypoints, minPartConfidence, ctx);
    }
  }
}

