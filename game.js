(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const W = 800;
  const H = 500;
  const CELL = 44;
  const COLS = 12;
  const ROWS = 5;
  const BOARD_X = 16;
  const BOARD_Y = 88;

  const PLAYER_BASE = { x: 0, y: 2 };
  const ENEMY_BASE = { x: 11, y: 2 };
  const PLAYER_SUMMON = [1, 2];
  const ENEMY_SUMMON = [9, 10];

  const UNITS = {
    Infantry: { cost: 1, hp: 2, attack: 1, range: 1, move: 1, name: "歩兵" },
    Warrior:  { cost: 3, hp: 5, attack: 1, range: 1, move: 2, name: "戦士" },
    Tank:     { cost: 5, hp: 8, attack: 2, range: 1, move: 1, name: "重戦士" },
    Archer:   { cost: 4, hp: 3, attack: 1, range: 3, move: 1, name: "弓兵" },
    Cavalry:  { cost: 5, hp: 4, attack: 2, range: 1, move: 3, name: "騎兵" },
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
      return candidates[Math.floor(Math.random() * Math.min(4, candidates.length))];
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
      const weights = options.map(k => Math.max(1, 6 - countUnits(enemyUnits, k) * 2));
      return weightedRandom(options, weights);
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
        attackUnit(enemy, target);
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
      y: 332,
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

    text("あそびかた", 400, 34, 36, "#ffdc46", true);

    // 左：基本ルール
    ctx.fillStyle = "#252532";
    ctx.fillRect(16, 68, 304, 350);
    ctx.strokeStyle = "#5d5d70";
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 68, 304, 350);

    text("基本ルール", 32, 89, 21, "#ffdc46", false);
    const rules = [
      "① ユニットボタンで種類を選ぶ",
      "② 左側2列の青い場所で召喚",
      "③ 自分のユニットをクリックして選択",
      "④ 緑のマス ＝ 移動できる場所",
      "⑤ 赤いマス＋◆ ＝ 攻撃できる対象",
      "⑥ 1体につき移動1回＋攻撃1回まで",
      "⑦ ターン終了で敵が自動で行動",
      "⑧ 敵の城HPを0にすれば勝利！",
    ];
    rules.forEach((r, i) => text(r, 32, 120 + i * 31, 14, "#eeeeef", false));

    text("見分け方", 32, 386, 18, "#ffdc46", false);
    text("青い輪＝自分　　赤い輪＝敵", 32, 408, 13, "#d9e6ff", false);

    // 右：ユニット性能と見た目
    ctx.fillStyle = "#252532";
    ctx.fillRect(332, 68, 452, 350);
    ctx.strokeStyle = "#5d5d70";
    ctx.lineWidth = 2;
    ctx.strokeRect(332, 68, 452, 350);

    text("ユニット性能・見た目", 350, 89, 21, "#ffdc46", false);

    const cards = [
      ["Infantry", 346, 108],
      ["Warrior", 492, 108],
      ["Tank", 638, 108],
      ["Archer", 419, 246],
      ["Cavalry", 565, 246],
    ];
    cards.forEach(([kind, x, y]) => drawUnitCard(kind, x, y));

    text("※ ユニット中央の形が種類、外側の青/赤が所属を表します。", 350, 389, 11, "#bfc0cb", false);
    drawButton(300, 438, 200, 40, "ホームへ戻る", "#4e6799", 17);
  }

  function drawUnitCard(kind, x, y) {
    const d = UNITS[kind];
    ctx.fillStyle = "#373747";
    ctx.fillRect(x, y, 135, 122);
    ctx.strokeStyle = "#767687";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 135, 122);

    text(d.name, x + 67, y + 15, 14, "#ffdc46", true);
    drawPreview(kind, x + 28, y + 53, 0.78);

    const rows = [
      `HP ${d.hp}`,
      `攻撃 ${d.attack}`,
      `射程 ${d.range}`,
      `移動 ${d.move}`,
      `コスト ${d.cost}`,
    ];
    rows.forEach((s, i) => text(s, x + 54, y + 42 + i * 15, 11, "#eeeeef", false));
  }

  function drawPreview(kind, x, y, scale = 1) {
    const colors = {
      Infantry: "#9a9aa4",
      Warrior: "#d7a83e",
      Tank: "#9b733e",
      Archer: "#3caac9",
      Cavalry: "#a45bd0",
    };
    drawUnitShape(kind, x, y, scale, colors[kind]);
  }

  function drawGame() {
    ctx.fillStyle = "#20202a";
    ctx.fillRect(0, 0, W, H);

    // 上部情報バー
    drawInfoPanel(12, 8, 116, 34, `自分 HP ${playerHp}`, "#3f8ff0");
    drawInfoPanel(136, 8, 116, 34, `敵 HP ${enemyHp}`, "#e25353");
    drawInfoPanel(260, 8, 154, 34, `エネルギー ${playerEnergy}/10`, "#b69535");
    drawInfoPanel(422, 8, 152, 34, `ターン ${turn === "player" ? "あなた" : "敵"} ${turnNumber}`, "#6c7bb8");
    drawInfoPanel(582, 8, 108, 34, DIFFICULTIES[difficulty], "#536b91");
    drawLegend(700, 25);

    // 盤面
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const px = BOARD_X + x * CELL;
        const py = BOARD_Y + y * CELL;

        ctx.fillStyle = "#444450";
        ctx.fillRect(px, py, CELL, CELL);

        if (PLAYER_SUMMON.includes(x)) {
          ctx.fillStyle = summonMode ? "#32784a" : "#284f82";
          ctx.fillRect(px, py, CELL, CELL);
          text("自軍", px + CELL / 2, py + CELL - 7, 8, "#b9dcff", true);
        } else if (ENEMY_SUMMON.includes(x)) {
          ctx.fillStyle = "#52365a";
          ctx.fillRect(px, py, CELL, CELL);
          text("敵軍", px + CELL / 2, py + CELL - 7, 8, "#ffc6d0", true);
        }

        ctx.strokeStyle = "#757584";
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, CELL, CELL);
      }
    }

    // 選択ユニットの移動範囲・攻撃対象を明確に表示
    if (selected) {
      if (!selected.moved) {
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            if (canMove(selected, x, y)) drawOverlay(x, y, "rgba(70,220,90,.24)");
          }
        }
      }

      if (!selected.attacked) {
        for (const e of enemyUnits) {
          if (canAttack(selected, e)) {
            drawOverlay(e.x, e.y, "rgba(240,70,70,.42)");
            drawTargetMarker(e.x, e.y);
          }
        }
        const base = ENEMY_BASE;
        const d = distance(selected, base);
        const canHitBase = selected.type === "Archer"
          ? d >= 2 && d <= selected.range
          : d <= selected.range;
        if (canHitBase) {
          drawOverlay(base.x, base.y, "rgba(240,70,70,.42)");
          drawTargetMarker(base.x, base.y);
        }
      }

      // 選択中ユニットの強いハイライト
      const sx = BOARD_X + selected.x * CELL;
      const sy = BOARD_Y + selected.y * CELL;
      ctx.strokeStyle = "#ffdc46";
      ctx.lineWidth = 3;
      ctx.strokeRect(sx + 2, sy + 2, CELL - 4, CELL - 4);
    }

    drawBase(PLAYER_BASE, "#2d8b58", "自分の城");
    drawBase(ENEMY_BASE, "#b94d4d", "敵の城");

    for (const u of playerUnits) drawUnit(u, false);
    for (const u of enemyUnits) drawUnit(u, true);

    // 召喚ボタン
    buttonRects().forEach((r) => {
      const selectedColor = summonMode === r.kind ? "#b69535" : unitButtonColor(r.kind);
      drawButton(r.x, r.y, r.w, r.h, `${UNITS[r.kind].name}  コスト${UNITS[r.kind].cost}`, selectedColor, 12);
    });

    drawButton(522, 332, 122, 42, "ターン終了", "#537343", 13);
    drawButton(656, 332, 102, 42, "ホーム", "#4a4a5c", 13);

    // 行動説明エリア
    ctx.fillStyle = "#2a2a36";
    ctx.fillRect(12, 382, 746, 104);
    ctx.strokeStyle = "#555565";
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 382, 746, 104);

    let info = "ユニットをクリックして選択してください";
    if (summonMode) info = `${UNITS[summonMode].name}：左側の青い自軍エリアをクリックして召喚`;

    text(info, 24, 398, 13, "#f0f0f4", false);
    text("緑 = 移動できる場所", 24, 421, 12, "#7cf39b", false);
    text("赤 + ◆ = 今すぐ攻撃できる対象", 205, 421, 12, "#ff8585", false);
    text("青い輪 = 自分", 475, 421, 12, "#8fbbff", false);
    text("赤い輪 = 敵", 610, 421, 12, "#ff9d9d", false);

    if (selected) {
      const moveText = selected.moved ? "移動済み" : "移動できます";
      const attackReady = hasAttackableTarget(selected);
      const attackText = selected.attacked ? "攻撃済み" : attackReady ? "攻撃できます" : "攻撃対象なし";
      text(`${UNITS[selected.type].name}  HP ${selected.hp}/${selected.maxHp}  攻撃 ${selected.attack}  射程 ${selected.range}  移動 ${selected.move}`, 24, 448, 12, "#eeeeef", false);
      drawStatusBadge(24, 473, moveText, selected.moved ? "#666b75" : "#38b86a");
      drawStatusBadge(132, 473, attackText, selected.attacked ? "#666b86" : attackReady ? "#e25555" : "#756a46");
      if (attackReady) text("赤い対象をクリック！", 270, 473, 12, "#ffb0b0", false);
    }

    if (gameWon || gameLost) {
      ctx.fillStyle = "rgba(10,10,15,.88)";
      ctx.fillRect(220, 176, 360, 124);
      ctx.strokeStyle = gameWon ? "#ffdc46" : "#ff8888";
      ctx.lineWidth = 3;
      ctx.strokeRect(220, 176, 360, 124);
      text(gameWon ? "勝利！" : "敗北…", 400, 220, 38, gameWon ? "#ffdc46" : "#ff8888", true);
      text("ホームで再戦できます", 400, 265, 15, "#eee", true);
    }
  }

  function drawInfoPanel(x, y, w, h, label, color) {
    ctx.fillStyle = "#292936";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    text(label, x + w / 2, y + h / 2 + 1, 12, "#f4f4f7", true);
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
    text("自分", x + 16, y - 2, 10, "#bcd7ff", false);
    ctx.fillStyle = "#e25353";
    ctx.fillRect(x + 55, y - 7, 10, 10);
    text("敵", x + 71, y - 2, 10, "#ffbcbc", false);
  }

  function drawBase(pos, color, label) {
    const px = BOARD_X + pos.x * CELL;
    const py = BOARD_Y + pos.y * CELL;
    ctx.fillStyle = color;
    ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
    text(label, px + CELL / 2, py + CELL / 2 + 10, 8, "#fff", true);
    text(pos === PLAYER_BASE ? "自" : "敵", px + CELL / 2, py + CELL / 2 - 7, 14, "#fff", true);
  }

  function drawUnit(unit, enemy) {
    const px = BOARD_X + unit.x * CELL + CELL / 2;
    const py = BOARD_Y + unit.y * CELL + CELL / 2;
    const bodyColors = {
      Infantry: "#9a9aa4",
      Warrior: "#d7a83e",
      Tank: "#9b733e",
      Archer: "#3caac9",
      Cavalry: "#a45bd0",
    };
    const teamColor = enemy ? "#e25353" : "#3f8ff0";
    const teamLight = enemy ? "#ffc0c0" : "#c7ddff";

    // 所属リング
    ctx.fillStyle = teamColor;
    ctx.beginPath();
    ctx.arc(px, py, 19, 0, Math.PI * 2);
    ctx.fill();

    // 種類ごとに形を完全に変える
    drawUnitShape(unit.type, px, py, 0.82, bodyColors[unit.type]);

    // 自/敵タグ
    ctx.fillStyle = teamColor;
    ctx.fillRect(px - 19, py + 12, 18, 10);
    text(enemy ? "敵" : "自", px - 10, py + 17, 8, "#fff", true);

    // 行動可能状態
    drawMiniActionBadge(px + 11, py - 14, "移", unit.moved ? "#666b75" : "#35bd65");
    const attackReadyColor = unit.attacked ? "#666b75" : hasAttackableTarget(unit) ? "#e34d4d" : "#756a46";
    drawMiniActionBadge(px + 11, py + 5, "攻", attackReadyColor);

    // HPバー
    ctx.fillStyle = "#17171d";
    ctx.fillRect(px - 17, py - 26, 34, 5);
    ctx.fillStyle = unit.hp / unit.maxHp <= 0.35 ? "#ff6868" : "#50d26b";
    ctx.fillRect(px - 17, py - 26, 34 * Math.max(0, unit.hp / unit.maxHp), 5);

    // 選択中は黄色の太枠
    if (unit === selected) {
      ctx.strokeStyle = "#ffdc46";
      ctx.lineWidth = 3;
      ctx.strokeRect(px - 21, py - 21, 42, 42);
    }

    // 進行方向マーク
    ctx.fillStyle = teamLight;
    ctx.beginPath();
    if (enemy) {
      ctx.moveTo(px - 21, py);
      ctx.lineTo(px - 15, py - 4);
      ctx.lineTo(px - 15, py + 4);
    } else {
      ctx.moveTo(px + 21, py);
      ctx.lineTo(px + 15, py - 4);
      ctx.lineTo(px + 15, py + 4);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ユニット種類ごとの固有アイコン
  function drawUnitShape(kind, x, y, scale = 1, color = "#fff") {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, 2 * scale);

    if (kind === "Infantry") {
      // 歩兵：盾＋頭
      const w = 16 * scale;
      const h = 18 * scale;
      ctx.fillRect(x - w / 2, y - h / 2 + 3 * scale, w, h - 4 * scale);
      ctx.fillRect(x - 5 * scale, y - 10 * scale, 10 * scale, 8 * scale);
      ctx.fillRect(x - 4 * scale, y + 10 * scale, 8 * scale, 3 * scale);
    } else if (kind === "Warrior") {
      // 戦士：六角形の盾
      const r = 15 * scale;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else if (kind === "Tank") {
      // 重戦士：装甲＋砲塔のような独自形
      const w = 28 * scale;
      const h = 18 * scale;
      ctx.fillRect(x - w / 2, y - h / 2 + 4 * scale, w, h);
      ctx.fillRect(x - 8 * scale, y - 11 * scale, 16 * scale, 8 * scale);
      ctx.fillRect(x + 5 * scale, y - 9 * scale, 12 * scale, 4 * scale);
      ctx.fillRect(x - 10 * scale, y + 12 * scale, 7 * scale, 4 * scale);
      ctx.fillRect(x + 3 * scale, y + 12 * scale, 7 * scale, 4 * scale);
    } else if (kind === "Archer") {
      // 弓兵：三角の体＋弓の弧＋矢
      ctx.beginPath();
      ctx.moveTo(x, y - 17 * scale);
      ctx.lineTo(x + 14 * scale, y + 13 * scale);
      ctx.lineTo(x - 14 * scale, y + 13 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 8 * scale, y, 13 * scale, -1.05, 1.05);
      ctx.strokeStyle = "#f3f3f5";
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 1 * scale, y - 12 * scale);
      ctx.lineTo(x + 13 * scale, y - 12 * scale);
      ctx.stroke();
    } else if (kind === "Cavalry") {
      // 騎兵：ひし形＋頭＋脚で他ユニットと重ならない形
      ctx.beginPath();
      ctx.moveTo(x, y - 17 * scale);
      ctx.lineTo(x + 15 * scale, y - 1 * scale);
      ctx.lineTo(x, y + 13 * scale);
      ctx.lineTo(x - 15 * scale, y - 1 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 8 * scale, y - 10 * scale, 5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 10 * scale, y + 10 * scale, 5 * scale, 5 * scale);
      ctx.fillRect(x + 5 * scale, y + 10 * scale, 5 * scale, 5 * scale);
    }

    ctx.restore();
  }

  function drawTargetMarker(x, y) {
    const px = BOARD_X + x * CELL + CELL / 2;
    const py = BOARD_Y + y * CELL + CELL / 2;
    ctx.strokeStyle = "#ff5b5b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, py - 11);
    ctx.lineTo(px + 11, py);
    ctx.lineTo(px, py + 11);
    ctx.lineTo(px - 11, py);
    ctx.closePath();
    ctx.stroke();
  }

  function drawMiniActionBadge(x, y, label, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    text(label, x, y + 0.5, 9, "#fff", true);
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
      if (hitRect(mx, my, {x:656,y:332,w:102,h:42})) {
        screenMode = "home";
        resetGame();
      }
      return;
    }

    if (turn !== "player") return;

    if (hitRect(mx, my, {x:656,y:332,w:102,h:42})) {
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

    if (hitRect(mx, my, {x:522,y:332,w:122,h:42})) {
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
