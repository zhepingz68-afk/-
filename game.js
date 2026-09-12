(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const W = 800;
  const H = 500;
  const CELL = 38;
  const COLS = 12;
  const ROWS = 5;
  const BOARD_X = 16;
  const BOARD_Y = 90;

  const PLAYER_BASE = { x: 0, y: 2 };
  const ENEMY_BASE = { x: 11, y: 2 };
  const PLAYER_SUMMON = [1, 2];
  const ENEMY_SUMMON = [9, 10];

  const UNITS = {
    Infantry: { cost: 1, hp: 4, attack: 1, range: 1, move: 1, name: "歩兵" },
    Warrior:  { cost: 3, hp: 10, attack: 2, range: 1, move: 2, name: "戦士" },
    Tank:     { cost: 5, hp: 16, attack: 4, range: 1, move: 1, name: "重戦士" },
    Archer:   { cost: 4, hp: 6, attack: 2, range: 3, move: 1, name: "弓兵" },
    Cavalry:  { cost: 5, hp: 8, attack: 4, range: 1, move: 3, name: "騎兵" },
  };

  const DIFFICULTIES = {
    easy: "かんたん",
    normal: "ふつう",
    hard: "むずかしい",
    oni: "鬼",
  };

  let screenMode = "home";
  let difficulty = "normal";
  let playerHp = 10;
  let enemyHp = 10;
  let playerEnergy = 5;
  let enemyEnergy = 5;
  let turn = "player";
  let turnNumber = 1;
  let selected = null;
  let summonMode = null;
  let gameWon = false;
  let gameLost = false;
  let resultReported = false;
  let playerUnits = [];
  let enemyUnits = [];

  function playerId() {
    let id = localStorage.getItem("energy_battle_player_id");
    if (!id) {
      id = (crypto && crypto.randomUUID) ? crypto.randomUUID() :
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("energy_battle_player_id", id);
    }
    return id;
  }

  async function recordEvent(result) {
    const cfg = window.ENERGY_BATTLE_SUPABASE || {};
    if (!cfg.url || !cfg.anonKey) return;

    try {
      const response = await fetch(`${cfg.url}/rest/v1/game_events`, {
        method: "POST",
        headers: {
          "apikey": cfg.anonKey,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          player_id: playerId(),
          difficulty,
          result,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }

      if (window.refreshStats) window.refreshStats();
    } catch (error) {
      console.warn("統計送信に失敗しました", error);
      const status = document.getElementById("statsStatus");
      if (status) status.textContent = "統計の送信に失敗しました。コンソールを確認してください。";
    }
  }

  function reportResult(result) {
    if (resultReported) return;
    resultReported = true;
    recordEvent(result);
  }

  function distance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function circleDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function findUnit(list, x, y) {
    return list.find(u => u.x === x && u.y === y) || null;
  }

  function occupied(x, y) {
    return Boolean(
      findUnit(playerUnits, x, y) ||
      findUnit(enemyUnits, x, y) ||
      (x === PLAYER_BASE.x && y === PLAYER_BASE.y) ||
      (x === ENEMY_BASE.x && y === ENEMY_BASE.y)
    );
  }

  function createUnit(type, x, y, enemy = false) {
    const d = UNITS[type];
    return {
      type, x, y,
      hp: d.hp,
      maxHp: d.hp,
      attack: d.attack,
      range: d.range,
      move: d.move,
      enemy,
      moved: false,
      attacked: false,
    };
  }

  function resetGame(reportStart = false) {
    playerHp = 10;
    enemyHp = 10;
    playerEnergy = 5;
    enemyEnergy = 5;
    turn = "player";
    turnNumber = 1;
    selected = null;
    summonMode = null;
    gameWon = false;
    gameLost = false;
    resultReported = false;

    playerUnits = [];
    enemyUnits = [];

    // ゲーム開始時：両軍とも歩兵5体を縦一列に配置
    for (let y = 0; y < ROWS; y++) {
      playerUnits.push(createUnit("Infantry", 1, y, false));
      enemyUnits.push(createUnit("Infantry", 10, y, true));
    }

    if (reportStart) recordEvent("start");
  }

  function startGame() {
    resetGame(true);
    screenMode = "game";
  }

  function isValidCell(x, y) {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  function canMove(unit, tx, ty) {
    if (!isValidCell(tx, ty) || unit.moved || occupied(tx, ty)) return false;
    if ((tx === PLAYER_BASE.x && ty === PLAYER_BASE.y) || (tx === ENEMY_BASE.x && ty === ENEMY_BASE.y)) return false;

    const target = { x: tx, y: ty };
    if (unit.type === "Warrior") {
      if (circleDistance(unit, target) > unit.move) return false;
    } else if (unit.type === "Cavalry") {
      if (unit.x !== tx && unit.y !== ty) return false;
      if (distance(unit, target) > unit.move) return false;
    } else {
      if (distance(unit, target) > unit.move) return false;
    }

    return pathClear(unit, tx, ty);
  }

  function pathClear(unit, tx, ty) {
    const queue = [{ x: unit.x, y: unit.y, d: 0 }];
    const seen = new Set([`${unit.x},${unit.y}`]);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

    while (queue.length) {
      const cur = queue.shift();
      if (cur.x === tx && cur.y === ty) return true;
      if (cur.d >= unit.move) continue;

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!isValidCell(nx, ny)) continue;
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        if (!(nx === tx && ny === ty) && occupied(nx, ny)) continue;
        seen.add(key);
        queue.push({ x: nx, y: ny, d: cur.d + 1 });
      }
    }
    return false;
  }

  function moveUnit(unit, tx, ty) {
    if (!canMove(unit, tx, ty)) return false;
    unit.x = tx;
    unit.y = ty;
    unit.moved = true;
    return true;
  }

  function canAttack(attacker, target) {
    if (attacker.attacked) return false;
    const d = distance(attacker, target);
    return attacker.type === "Archer"
      ? d >= 2 && d <= attacker.range
      : d <= attacker.range;
  }

  function hasAttackableTarget(unit) {
    if (unit.attacked) return false;
    if (enemyUnits.some(e => canAttack(unit, e))) return true;

    const base = unit.enemy ? PLAYER_BASE : ENEMY_BASE;
    const d = distance(unit, base);
    return unit.type === "Archer"
      ? d >= 2 && d <= unit.range
      : d <= unit.range;
  }

  function attackUnit(attacker, target) {
    if (!canAttack(attacker, target)) return false;
    target.hp -= attacker.attack;
    attacker.attacked = true;

    if (target.hp <= 0) {
      if (target.enemy) {
        enemyUnits = enemyUnits.filter(u => u !== target);
      } else {
        playerUnits = playerUnits.filter(u => u !== target);
      }
    }
    return true;
  }

  function attackBase(attacker, enemyBase = true) {
    if (attacker.attacked) return false;
    const target = enemyBase ? ENEMY_BASE : PLAYER_BASE;
    const d = distance(attacker, target);
    const allowed = attacker.type === "Archer"
      ? d >= 2 && d <= attacker.range
      : d <= attacker.range;
    if (!allowed) return false;

    if (enemyBase) enemyHp = Math.max(0, enemyHp - attacker.attack);
    else playerHp = Math.max(0, playerHp - attacker.attack);
    attacker.attacked = true;

    checkGameOver();
    return true;
  }

  function countUnits(list, type) {
    return list.filter(u => u.type === type).length;
  }

  function bestAttack(enemy) {
    const targets = playerUnits.filter(p => canAttack(enemy, p));
    if (!targets.length) return null;

    const killable = targets.filter(p => p.hp <= enemy.attack);
    if (killable.length) return killable.sort((a,b) => a.hp - b.hp)[0];

    if (difficulty === "easy") return targets[Math.floor(Math.random() * targets.length)];

    return [...targets].sort((a,b) => {
      if (difficulty === "oni") {
        return (b.attack * 30 - b.hp * 2) - (a.attack * 30 - a.hp * 2);
      }
      return (b.attack * 10 - b.hp) - (a.attack * 10 - a.hp);
    })[0];
  }

  function bestMove(enemy) {
    const candidates = [];

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!canMove(enemy, x, y)) continue;

        const baseDist = distance({ x, y }, PLAYER_BASE);
        let score = -baseDist * (difficulty === "oni" ? 13 : difficulty === "hard" ? 10 : difficulty === "normal" ? 8 : 6);

        for (const p of playerUnits) {
          const d = distance({ x, y }, p);
          const canHit = enemy.type === "Archer"
            ? d >= 2 && d <= enemy.range
            : d <= enemy.range;

          if (canHit) {
            score += 80;
            if (p.hp <= enemy.attack) score += difficulty === "oni" ? 150 : 100;
            score += p.attack * (difficulty === "oni" ? 22 : difficulty === "hard" ? 10 : 4);
          }

          if (enemy.type === "Archer") {
            if (d === 1) score -= 30;
            if (d >= 2 && d <= enemy.range) score += 20;
          }
        }

        if (difficulty === "easy") score += Math.random() * 50 - 25;
        if (difficulty === "normal") score += Math.random() * 16 - 8;
        if (difficulty === "hard") score += Math.random() * 4 - 2;

        candidates.push({ x, y, score });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a,b) => b.score - a.score);

    if (difficulty === "easy") {
      // かんたん：最適な移動よりもランダムな移動を選びやすくする
      const poolSize = Math.min(8, candidates.length);
      return candidates[Math.floor(Math.random() * poolSize)];
    }
    return candidates[0];
  }

  function chooseEnemyUnit() {
    const affordable = Object.keys(UNITS).filter(k => UNITS[k].cost <= enemyEnergy);
    if (!affordable.length) return null;

    let options = [...affordable];
    const archerCount = countUnits(enemyUnits, "Archer");
    const playerArchers = countUnits(playerUnits, "Archer");
    const playerTanks = countUnits(playerUnits, "Tank");
    const playerCavalry = countUnits(playerUnits, "Cavalry");
    const playerWarriors = countUnits(playerUnits, "Warrior");
    const playerInfantry = countUnits(playerUnits, "Infantry");

    // 弓兵は原則1体まで
    if (archerCount >= 1) {
      const noArcher = options.filter(k => k !== "Archer");
      if (noArcher.length) options = noArcher;
    }

    if (difficulty === "easy") {
      // かんたん：強い対策をあまり考えず、手持ちからランダムに選ぶ
      return options[Math.floor(Math.random() * options.length)];
    }

    if (difficulty === "normal") {
      if (playerArchers >= 1 && options.includes("Tank")) return "Tank";
      if (playerTanks >= 2 && options.includes("Cavalry")) return "Cavalry";
      if (playerCavalry >= 2 && options.includes("Tank")) return "Tank";
      if (playerWarriors >= 2 && options.includes("Tank")) return "Tank";
      if (playerInfantry >= 3 && options.includes("Warrior")) return "Warrior";
      if (options.includes("Tank") && countUnits(enemyUnits, "Tank") === 0) return "Tank";
      return options[Math.floor(Math.random() * options.length)];
    }

    const scores = {};

    for (const kind of options) {
      let score = 0;

      if (difficulty === "hard") {
        if (kind === "Tank") {
          score += playerArchers * 75 + playerWarriors * 20 + playerCavalry * 10 + playerInfantry * 5 + 15;
          score -= countUnits(enemyUnits, "Tank") * 6;
        } else if (kind === "Cavalry") {
          score += playerTanks * 35 + playerArchers * 25;
          score -= countUnits(enemyUnits, "Cavalry") * 8;
        } else if (kind === "Warrior") {
          score += playerCavalry * 20 + playerInfantry * 15 + 15;
          score -= countUnits(enemyUnits, "Warrior") * 5;
        } else if (kind === "Infantry") {
          score += 8 - countUnits(enemyUnits, "Infantry") * 3;
        } else if (kind === "Archer") {
          score -= 30 + archerCount * 60;
          score += playerArchers * 15;
        }
      } else {
        // 鬼：弓兵には重戦士、重戦士には騎兵、騎兵には戦士/重戦士を強く優先
        if (kind === "Tank") {
          score += playerArchers * 110;
          score += playerWarriors * 35;
          score += playerCavalry * 25;
          score += playerInfantry * 12;
          score -= countUnits(enemyUnits, "Tank") * 12;
        } else if (kind === "Cavalry") {
          score += playerTanks * 100;
          score += playerArchers * 35;
          score -= countUnits(enemyUnits, "Cavalry") * 12;
        } else if (kind === "Warrior") {
          score += playerCavalry * 55 + playerInfantry * 20 + 20;
          score -= countUnits(enemyUnits, "Warrior") * 8;
        } else if (kind === "Infantry") {
          score += 5 - countUnits(enemyUnits, "Infantry") * 8;
          if (enemyEnergy <= 2) score += 45;
        } else if (kind === "Archer") {
          score -= 50 + archerCount * 25;
          score += playerTanks * 10;
        }
      }

      scores[kind] = score;
    }

    const bestScore = Math.max(...Object.values(scores));
    const best = Object.keys(scores).filter(k => scores[k] === bestScore);
    const priority = ["Tank", "Cavalry", "Warrior", "Infantry", "Archer"];
    return priority.find(k => best.includes(k)) || best[0];
  }

  function weightedRandom(items, weights) {
    const total = weights.reduce((a,b) => a+b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function enemySpawn() {
    const kind = chooseEnemyUnit();
    if (!kind) return;
    for (const x of ENEMY_SUMMON) {
      for (let y = 0; y < ROWS; y++) {
        if (!occupied(x, y) && enemyEnergy >= UNITS[kind].cost) {
          enemyUnits.push(createUnit(kind, x, y, true));
          enemyEnergy -= UNITS[kind].cost;
          return;
        }
      }
    }
  }

  function enemyTurn() {
    turn = "enemy";

    for (const enemy of [...enemyUnits]) {
      if (!enemyUnits.includes(enemy)) continue;

      const target = bestAttack(enemy);
      if (target) {
        if (difficulty !== "easy" || Math.random() < 0.72) {
          attackUnit(enemy, target);
          continue;
        }
      }

      if (difficulty === "easy" && Math.random() < 0.35) {
        continue;
      }

      if (attackBase(enemy, false)) continue;

      const pos = bestMove(enemy);
      if (pos) moveUnit(enemy, pos.x, pos.y);

      const after = bestAttack(enemy);
      if (after) attackUnit(enemy, after);
      else attackBase(enemy, false);

      if (playerHp <= 0) break;
    }

    enemySpawn();
    startPlayerTurn();
  }

  function startPlayerTurn() {
    turn = "player";
    turnNumber++;
    playerEnergy = Math.min(10, playerEnergy + 2);
    enemyEnergy = Math.min(10, enemyEnergy + 2);

    for (const u of [...playerUnits, ...enemyUnits]) {
      u.moved = false;
      u.attacked = false;
    }

    selected = null;
    summonMode = null;
  }

  function checkGameOver() {
    if (enemyHp <= 0 && !gameWon) {
      gameWon = true;
      reportResult("win");
    }
    if (playerHp <= 0 && !gameLost) {
      gameLost = true;
      reportResult("loss");
    }
  }

  function cellFromMouse(mx, my) {
    const x = Math.floor((mx - BOARD_X) / CELL);
    const y = Math.floor((my - BOARD_Y) / CELL);
    if (!isValidCell(x, y)) return null;
    return { x, y };
  }

  function buttonRects() {
    const names = Object.keys(UNITS);
    return names.map((k, i) => ({
      kind: k,
      x: 12 + i * 102,
      y: 315,
      w: 94,
      h: 42,
    }));
  }

  function hitRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  function drawHome() {
    ctx.fillStyle = "#191923";
    ctx.fillRect(0, 0, W, H);

    text("ENERGY BATTLE", 400, 65, 48, "#ffdc46", true);
    text("ターン制ボードバトル", 400, 108, 24, "#ccccd6", true);
    text("このゲームはChatGPTのサポートで制作しました。", 400, 132, 14, "#9999aa", true);

    drawButton(270, 165, 260, 50, "ゲームスタート", "#3f8f5d", 24);
    drawButton(270, 225, 260, 50, "あそびかた", "#4668a8", 24);
    drawButton(270, 285, 260, 50, "終了", "#8f4444", 24);

    text("難易度を選択", 400, 360, 18, "#ffdc46", true);

    const ds = ["easy", "normal", "hard", "oni"];
    ds.forEach((d, i) => {
      const x = 50 + i * 176;
      const color = difficulty === d ? "#98792f" : "#3f3f50";
      drawButton(x, 380, 160, 45, DIFFICULTIES[d], color, 17);
    });

    text("リソースは全難易度で同じ。変わるのはボットの賢さだけ。", 400, 455, 14, "#9ccaff", true);
  }

  function drawHowto() {
    ctx.fillStyle = "#191923";
    ctx.fillRect(0, 0, W, H);

    text("あそびかた", 400, 32, 36, "#ffdc46", true);

    // 左：基本ルール＋画面の見方
    ctx.fillStyle = "#2b2b38";
    ctx.fillRect(16, 58, 300, 356);
    ctx.strokeStyle = "#666679";
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 58, 300, 356);

    text("基本ルール", 30, 82, 21, "#ffdc46", false);

    const rules = [
      "① ユニットを選び、青い召喚エリアに召喚",
      "② 自分のユニットをクリックして選択",
      "③ 緑のマス＝移動できる場所",
      "④ 赤いマス＋◆＝攻撃できる対象",
      "⑤ 1体につき移動1回・攻撃1回",
      "⑥ ターン終了で敵が自動で行動",
      "⑦ 敵の城HPを0にすると勝利！",
    ];
    rules.forEach((r, i) => text(r, 30, 109 + i * 24, 12, "#eeeeef", false));

    text("画面の見方", 30, 289, 18, "#ffdc46", false);

    ctx.fillStyle = "rgba(70,220,90,.60)";
    ctx.fillRect(30, 306, 15, 15);
    text("緑＝移動できる", 53, 314, 12, "#d6efd9", false);

    ctx.fillStyle = "rgba(240,70,70,.65)";
    ctx.fillRect(30, 333, 15, 15);
    text("赤＋◆＝攻撃できる", 53, 341, 12, "#ffd0d0", false);

    ctx.strokeStyle = "#3f8ff0";
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 360, 18, 18);
    text("青い輪＝自分", 55, 369, 12, "#bcd7ff", false);

    ctx.strokeStyle = "#e25353";
    ctx.strokeRect(165, 360, 18, 18);
    text("赤い輪＝敵", 190, 369, 12, "#ffbcbc", false);

    text("「移」＝移動状態　「攻」＝攻撃状態", 30, 398, 10, "#c7c7d2", false);

    // 右：性能と行動表示
    ctx.fillStyle = "#232331";
    ctx.fillRect(328, 58, 456, 356);
    ctx.strokeStyle = "#666679";
    ctx.strokeRect(328, 58, 456, 356);

    text("ユニット性能", 348, 82, 21, "#ffdc46", false);

    drawUnitCard("Infantry", 342, 96);
    drawUnitCard("Warrior", 560, 96);
    drawUnitCard("Tank", 342, 158);
    drawUnitCard("Archer", 560, 158);
    drawUnitCard("Cavalry", 342, 220);

    text("行動表示", 348, 302, 18, "#ffdc46", false);

    drawMiniActionBadge(356, 330, "移", "#38b86a");
    text("まだ移動できる", 372, 330, 11, "#eeeeef", false);

    drawMiniActionBadge(356, 356, "攻", "#e25555");
    text("攻撃できる", 372, 356, 11, "#eeeeef", false);

    drawMiniActionBadge(356, 382, "攻", "#666");
    text("攻撃済み", 372, 382, 11, "#eeeeef", false);

    text("弓兵：隣接攻撃不可 / 2～3マス", 510, 330, 11, "#d6d6df", false);
    text("重戦士：高HP・高火力", 510, 356, 11, "#d6d6df", false);
    text("騎兵：3マス移動", 510, 382, 11, "#d6d6df", false);

    drawButton(300, 440, 200, 40, "ホームへ戻る", "#4e6799", 17);
  }

  function drawUnitCard(kind, x, y) {
    const d = UNITS[kind];

    ctx.fillStyle = "#373747";
    ctx.fillRect(x, y, 208, 55);
    ctx.strokeStyle = "#767687";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, 208, 55);

    drawPreview(kind, x + 23, y + 27, 0.70);
    text(d.name, x + 43, y + 12, 12, "#ffdc46", false);
    text(`HP ${d.hp}   攻 ${d.attack}   射 ${d.range}`, x + 43, y + 29, 9, "#eeeeef", false);
    text(`移 ${d.move}   コ ${d.cost}`, x + 43, y + 43, 9, "#eeeeef", false);
  }

  function drawPreview(kind, x, y, scale = 0.70) {
    const teamColor = "#3f8ff0";
    const teamDark = "#2456a8";
    const core = "#a8a8b0";
    const coreDark = "#70717a";
    const accent = "#e8edf6";
    const s = scale;

    ctx.fillStyle = teamDark;
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = teamColor;
    ctx.beginPath();
    ctx.arc(x, y, 16 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = core;
    ctx.strokeStyle = coreDark;
    ctx.lineWidth = Math.max(1, 2 * s);

    if (kind === "Infantry") {
      ctx.beginPath();
      ctx.moveTo(x, y - 11*s);
      ctx.lineTo(x + 10*s, y - 5*s);
      ctx.lineTo(x + 8*s, y + 7*s);
      ctx.lineTo(x, y + 12*s);
      ctx.lineTo(x - 8*s, y + 7*s);
      ctx.lineTo(x - 10*s, y - 5*s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (kind === "Warrior") {
      ctx.beginPath();
      ctx.arc(x, y, 11*s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, 3*s);
      ctx.beginPath();
      ctx.moveTo(x + 3*s, y - 7*s);
      ctx.lineTo(x - 5*s, y + 5*s);
      ctx.stroke();
    } else if (kind === "Tank") {
      // 重戦士：重装甲の強い戦士
      ctx.fillStyle = coreDark;
      ctx.fillRect(x - 12*s, y - 10*s, 24*s, 21*s);
      ctx.fillStyle = core;
      ctx.fillRect(x - 9*s, y - 5*s, 18*s, 14*s);
      ctx.strokeRect(x - 9*s, y - 5*s, 18*s, 14*s);

      ctx.fillRect(x - 8*s, y - 13*s, 16*s, 9*s);

      ctx.beginPath();
      ctx.moveTo(x - 11*s, y - 5*s);
      ctx.lineTo(x - 17*s, y + 1*s);
      ctx.lineTo(x - 11*s, y + 8*s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + 11*s, y - 5*s);
      ctx.lineTo(x + 17*s, y + 1*s);
      ctx.lineTo(x + 11*s, y + 8*s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#d6d7dd";
      ctx.fillRect(x - 7*s, y - 12*s, 14*s, 6*s);

      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, 3*s);
      ctx.beginPath();
      ctx.moveTo(x + 5*s, y - 2*s);
      ctx.lineTo(x + 17*s, y - 14*s);
      ctx.stroke();
    } else if (kind === "Archer") {
      ctx.beginPath();
      ctx.moveTo(x, y - 12*s);
      ctx.lineTo(x + 10*s, y + 9*s);
      ctx.lineTo(x - 10*s, y + 9*s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, 2*s);
      ctx.beginPath();
      ctx.arc(x - 2*s, y, 10*s, -1.15, 1.15);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + 2*s, y - 7*s);
      ctx.lineTo(x + 2*s, y + 7*s);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y - 12*s);
      ctx.lineTo(x + 10*s, y);
      ctx.lineTo(x, y + 12*s);
      ctx.lineTo(x - 10*s, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = coreDark;
      ctx.beginPath();
      ctx.moveTo(x + 4*s, y - 6*s);
      ctx.lineTo(x + 11*s, y - 1*s);
      ctx.lineTo(x + 5*s, y + 5*s);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGame() {
    ctx.fillStyle = "#20202a";
    ctx.fillRect(0, 0, W, H);

    text(`自分 HP: ${playerHp}`, 15, 22, 14, "#fff", false);
    text(`敵 HP: ${enemyHp}`, 135, 22, 14, "#ff8888", false);
    text(`エネルギー: ${playerEnergy}/10`, 235, 22, 14, "#ffdc46", false);
    text(`ターン: ${turn === "player" ? "あなた" : "敵"} ${turnNumber}`, 390, 22, 14, "#fff", false);
    text(`難易度: ${DIFFICULTIES[difficulty]}`, 650, 22, 13, "#9ccaff", false);
    // 色の凡例
    drawLegend(650, 48);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const px = BOARD_X + x * CELL;
        const py = BOARD_Y + y * CELL;

        ctx.fillStyle = "#444450";
        ctx.fillRect(px, py, CELL, CELL);

        if (PLAYER_SUMMON.includes(x)) {
          ctx.fillStyle = summonMode ? "#3f8954" : "#2a568f";
          ctx.fillRect(px, py, CELL, CELL);
        } else if (ENEMY_SUMMON.includes(x)) {
          ctx.fillStyle = "#52365a";
          ctx.fillRect(px, py, CELL, CELL);
        }

        ctx.strokeStyle = "#71717d";
        ctx.strokeRect(px, py, CELL, CELL);
      }
    }

    if (selected) {
      if (!selected.moved) {
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            if (canMove(selected, x, y)) drawOverlay(x, y, "rgba(70,220,90,.28)");
          }
        }
      }

      if (!selected.attacked) {
        for (const e of enemyUnits) {
          if (canAttack(selected, e)) {
            drawOverlay(e.x, e.y, "rgba(240,70,70,.34)");
            drawTargetMarker(e.x, e.y);
          }
        }
        const base = ENEMY_BASE;
        const d = distance(selected, base);
        const canHitBase = selected.type === "Archer"
          ? d >= 2 && d <= selected.range
          : d <= selected.range;
        if (canHitBase) {
          drawOverlay(base.x, base.y, "rgba(240,70,70,.34)");
          drawTargetMarker(base.x, base.y);
        }
      }
    }

    drawBase(PLAYER_BASE, "#2d8b58", "自分の城");
    drawBase(ENEMY_BASE, "#b94d4d", "敵の城");

    for (const u of playerUnits) drawUnit(u, false);
    for (const u of enemyUnits) drawUnit(u, true);

    buttonRects().forEach((r) => {
      const selectedColor = summonMode === r.kind ? "#b69535" : unitButtonColor(r.kind);
      drawButton(r.x, r.y, r.w, r.h, `${UNITS[r.kind].name} ${UNITS[r.kind].cost}`, selectedColor, 13);
    });

    drawButton(510, 315, 100, 42, "ターン終了", "#537343", 13);
    drawButton(625, 315, 90, 42, "ホーム", "#4a4a5c", 13);

    let info = "ユニットをクリックして選択してください";
    if (summonMode) info = `${UNITS[summonMode].name}を召喚する場所を選択`;
    if (selected) {
      const moveText = selected.moved ? "移動済み" : "移動OK";
      const attackReady = hasAttackableTarget(selected);
      const attackText = selected.attacked ? "攻撃済み" : attackReady ? "攻撃可能" : "攻撃範囲に敵なし";
      info = `${UNITS[selected.type].name}  HP:${selected.hp}/${selected.maxHp}  攻撃:${selected.attack}  射程:${selected.range}  移動:${selected.move}`;
      text(info, 20, 442, 12, "#eeeeef", false);
      drawStatusBadge(20, 463, moveText, selected.moved ? "#6b6b76" : "#38b86a");
      drawStatusBadge(92, 463, attackText, selected.attacked ? "#6b6b76" : attackReady ? "#e25555" : "#756a46");
      if (attackReady) {
        text("赤いマス・◆ = 攻撃できる場所", 245, 463, 12, "#ff9b9b", false);
      } else if (!selected.attacked) {
        text("◆は今の位置から攻撃できる敵", 250, 463, 12, "#d0bb7a", false);
      }
    }

    if (gameWon || gameLost) {
      ctx.fillStyle = "rgba(10,10,15,.86)";
      ctx.fillRect(240, 175, 320, 110);
      text(gameWon ? "勝利！" : "敗北…", 400, 218, 36, gameWon ? "#ffdc46" : "#ff8888", true);
      text("ホームで再戦できます", 400, 258, 15, "#eee", true);
    }
  }

  function unitButtonColor(kind) {
    return {
      Infantry: "#666a72",
      Warrior: "#5064a8",
      Tank: "#836437",
      Archer: "#327b9b",
      Cavalry: "#75479c",
    }[kind];
  }

  function drawLegend(x, y) {
    ctx.fillStyle = "#3f8ff0";
    ctx.fillRect(x, y - 7, 10, 10);
    text("自分", x + 16, y - 2, 11, "#bcd7ff", false);
    ctx.fillStyle = "#e25353";
    ctx.fillRect(x + 53, y - 7, 10, 10);
    text("敵", x + 69, y - 2, 11, "#ffbcbc", false);
  }

  function drawBase(pos, color, label) {
    const px = BOARD_X + pos.x * CELL;
    const py = BOARD_Y + pos.y * CELL;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, CELL, CELL);
    text(label, px + 5, py + 31, 10, "#fff", false);
  }

  function drawUnit(unit, enemy) {
    const px = BOARD_X + unit.x * CELL + 19;
    const py = BOARD_Y + unit.y * CELL + 19;
    const bodyColors = {
      Infantry: "#8f8f98",
      Warrior: "#d7a83e",
      Tank: "#9b733e",
      Archer: "#3caac9",
      Cavalry: "#a45bd0",
    };
    const teamColor = enemy ? "#e25353" : "#3f8ff0";

    // チームカラーの外枠で、同じ種類でも自軍/敵軍を一目で判別できるようにする
    ctx.fillStyle = teamColor;
    ctx.beginPath();
    ctx.arc(px, py, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = bodyColors[unit.type];
    if (unit.type === "Infantry") ctx.fillRect(px - 10, py - 10, 20, 20);
    else if (unit.type === "Warrior") circle(px, py, 14);
    else if (unit.type === "Tank") ctx.fillRect(px - 13, py - 13, 26, 26);
    else if (unit.type === "Archer") {
      ctx.beginPath();
      ctx.moveTo(px, py - 15);
      ctx.lineTo(px + 14, py + 13);
      ctx.lineTo(px - 14, py + 13);
      ctx.closePath();
      ctx.fill();
    } else circle(px, py, 15);

    // 自軍は「青い右向きマーク」、敵軍は「赤い左向きマーク」
    ctx.fillStyle = teamColor;
    ctx.beginPath();
    if (enemy) {
      ctx.moveTo(px - 19, py);
      ctx.lineTo(px - 12, py - 5);
      ctx.lineTo(px - 12, py + 5);
    } else {
      ctx.moveTo(px + 19, py);
      ctx.lineTo(px + 12, py - 5);
      ctx.lineTo(px + 12, py + 5);
    }
    ctx.closePath();
    ctx.fill();

    if (unit === selected) {
      ctx.strokeStyle = "#ffdc46";
      ctx.lineWidth = 3;
      ctx.strokeRect(px - 20, py - 20, 40, 40);
    }

    // 行動表示はユニット本体に重ならないよう、セルの下側へ移動
    const moveColor = unit.moved ? "#666" : "#38b86a";
    const attackReadyColor = unit.attacked ? "#666" : hasAttackableTarget(unit) ? "#e25555" : "#756a46";
    drawMiniActionBadge(px - 9, py + 15, "移", moveColor);
    drawMiniActionBadge(px + 9, py + 15, "攻", attackReadyColor);

    // HPバーはユニットの上に固定し、本体の形を隠さない
    ctx.fillStyle = "#202020";
    ctx.fillRect(px - 17, py - 27, 34, 5);
    ctx.fillStyle = "#50d26b";
    ctx.fillRect(px - 17, py - 27, 34 * Math.max(0, unit.hp / unit.maxHp), 5);
  }

  function drawTargetMarker(x, y) {
    const px = BOARD_X + x * CELL + CELL / 2;
    const py = BOARD_Y + y * CELL + CELL / 2;
    ctx.strokeStyle = "#ff5b5b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py - 9);
    ctx.lineTo(px + 9, py);
    ctx.lineTo(px, py + 9);
    ctx.lineTo(px - 9, py);
    ctx.closePath();
    ctx.stroke();
  }

  function drawMiniActionBadge(x, y, label, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    text(label, x, y + 0.5, 8, "#fff", true);
  }

  function drawStatusBadge(x, y, label, color) {
    const w = label.length * 12 + 12;
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 9, w, 18);
    text(label, x + w / 2, y, 11, "#fff", true);
  }

  function drawOverlay(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(BOARD_X + x * CELL, BOARD_Y + y * CELL, CELL, CELL);
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawButton(x, y, w, h, label, color, size = 18) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#8f8f9e";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    text(label, x + w / 2, y + h / 2, size, "#fff", true);
  }

  function text(str, x, y, size, color, center) {
    ctx.fillStyle = color;
    ctx.font = `${size}px system-ui, sans-serif`;
    ctx.textAlign = center ? "center" : "left";
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
  }

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const mx = (event.clientX - rect.left) * scaleX;
    const my = (event.clientY - rect.top) * scaleY;

    if (screenMode === "home") {
      if (hitRect(mx, my, {x:270,y:165,w:260,h:50})) {
        startGame();
        return;
      }
      if (hitRect(mx, my, {x:270,y:225,w:260,h:50})) {
        screenMode = "howto";
        return;
      }
      if (hitRect(mx, my, {x:270,y:285,w:260,h:50})) {
        // ブラウザから安全に終了することはできないのでホームを維持
        return;
      }
      const ds = ["easy", "normal", "hard", "oni"];
      ds.forEach((d, i) => {
        const r = {x:50+i*176,y:380,w:160,h:45};
        if (hitRect(mx, my, r)) difficulty = d;
      });
      return;
    }

    if (screenMode === "howto") {
      if (hitRect(mx, my, {x:300,y:435,w:200,h:40})) screenMode = "home";
      return;
    }

    if (gameWon || gameLost) {
      if (hitRect(mx, my, {x:625,y:315,w:90,h:42})) {
        screenMode = "home";
        resetGame();
      }
      return;
    }

    if (turn !== "player") return;

    if (hitRect(mx, my, {x:625,y:315,w:90,h:42})) {
      screenMode = "home";
      resetGame();
      return;
    }

    // 召喚ボタン
    for (const r of buttonRects()) {
      if (hitRect(mx, my, r)) {
        if (playerEnergy >= UNITS[r.kind].cost) {
          summonMode = summonMode === r.kind ? null : r.kind;
          selected = null;
        }
        return;
      }
    }

    if (hitRect(mx, my, {x:510,y:315,w:100,h:42})) {
      summonMode = null;
      selected = null;
      enemyTurn();
      checkGameOver();
      return;
    }

    const cell = cellFromMouse(mx, my);
    if (!cell) return;

    if (summonMode) {
      if (PLAYER_SUMMON.includes(cell.x) && !occupied(cell.x, cell.y)) {
        const cost = UNITS[summonMode].cost;
        if (playerEnergy >= cost) {
          playerUnits.push(createUnit(summonMode, cell.x, cell.y, false));
          playerEnergy -= cost;
          summonMode = null;
        }
      }
      return;
    }

    const own = findUnit(playerUnits, cell.x, cell.y);
    if (own) {
      selected = own;
      return;
    }

    if (selected) {
      const enemy = findUnit(enemyUnits, cell.x, cell.y);
      if (enemy) {
        if (attackUnit(selected, enemy)) selected = null;
        checkGameOver();
        return;
      }

      if (cell.x === ENEMY_BASE.x && cell.y === ENEMY_BASE.y) {
        if (attackBase(selected, true)) selected = null;
        return;
      }

      if (moveUnit(selected, cell.x, cell.y)) selected = null;
    }
  });

  function loop() {
    if (screenMode === "home") drawHome();
    else if (screenMode === "howto") drawHowto();
    else drawGame();
    requestAnimationFrame(loop);
  }

  // 最初は説明画面ではなくホームから開始
  loop();
})();
