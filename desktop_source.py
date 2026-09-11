import pygame
import random

pygame.init()

WIDTH, HEIGHT = 800, 500
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Energy Battle")
clock = pygame.time.Clock()

FONT_PATH = "C:/Windows/Fonts/meiryo.ttc"
font = pygame.font.Font(FONT_PATH, 24)
small_font = pygame.font.Font(FONT_PATH, 18)
tiny_font = pygame.font.Font(FONT_PATH, 15)
big_font = pygame.font.Font(FONT_PATH, 40)
title_font = pygame.font.Font(FONT_PATH, 46)

# ==================================================
# ボード設定
# ==================================================

BOARD_X = 35
BOARD_Y = 65
CELL_SIZE = 60
COLS = 12
ROWS = 5

PLAYER_BASE = (0, 2)
ENEMY_BASE = (11, 2)

# プレイヤーと敵の召喚エリアは、それぞれ2列
PLAYER_SUMMON_COLUMNS = (1, 2)
ENEMY_SUMMON_COLUMNS = (9, 10)

# ==================================================
# ユニット
# ==================================================

UNITS = {
    "Infantry": {"cost": 1, "hp": 2, "attack": 1, "range": 1, "move": 1},
    "Warrior": {"cost": 3, "hp": 5, "attack": 1, "range": 1, "move": 2},
    "Tank": {"cost": 5, "hp": 8, "attack": 2, "range": 1, "move": 1},
    "Archer": {"cost": 4, "hp": 3, "attack": 1, "range": 3, "move": 1},
    "Cavalry": {"cost": 5, "hp": 4, "attack": 2, "range": 1, "move": 3},
}

NAMES = {
    "Infantry": "歩兵",
    "Warrior": "戦士",
    "Tank": "重戦士",
    "Archer": "弓兵",
    "Cavalry": "騎兵",
}

# ==================================================
# 難易度
# ==================================================

DIFFICULTIES = {
    "easy": "かんたん",
    "normal": "ふつう",
    "hard": "むずかしい",
    "oni": "鬼",
}

difficulty = "normal"

# ==================================================
# リソース
# ==================================================

MAX_ENERGY = 10
ENERGY_PER_TURN = 2
START_ENERGY = 5

# ==================================================
# ゲーム状態
# ==================================================

player_hp = 10
enemy_hp = 10
energy = START_ENERGY
enemy_energy = START_ENERGY
turn = "player"
turn_number = 1
game_won = False
game_lost = False
warriors = []
enemy_warriors = []
selected_unit = None
summon_mode = None
screen_mode = "home"

# ==================================================
# ボタン
# ==================================================

start_button = pygame.Rect(270, 160, 260, 50)
howto_button = pygame.Rect(270, 225, 260, 50)
quit_button = pygame.Rect(270, 290, 260, 50)

difficulty_buttons = {
    "easy": pygame.Rect(55, 380, 160, 45),
    "normal": pygame.Rect(225, 380, 160, 45),
    "hard": pygame.Rect(395, 380, 160, 45),
    "oni": pygame.Rect(565, 380, 160, 45),
}

howto_back_button = pygame.Rect(300, 445, 200, 40)

buttons = {
    "Infantry": pygame.Rect(10, 385, 95, 40),
    "Warrior": pygame.Rect(110, 385, 95, 40),
    "Tank": pygame.Rect(210, 385, 95, 40),
    "Archer": pygame.Rect(310, 385, 95, 40),
    "Cavalry": pygame.Rect(410, 385, 95, 40),
}

end_turn_button = pygame.Rect(510, 385, 100, 40)
home_game_button = pygame.Rect(625, 385, 90, 40)

# ==================================================
# 距離
# ==================================================

def distance(x1, y1, x2, y2):
    return abs(x1 - x2) + abs(y1 - y2)


def circle_distance(x1, y1, x2, y2):
    return ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5

# ==================================================
# ユニット検索
# ==================================================

def get_unit(units, x, y):
    return next((u for u in units if u["x"] == x and u["y"] == y), None)


def player_unit(x, y):
    return get_unit(warriors, x, y)


def enemy_unit(x, y):
    return get_unit(enemy_warriors, x, y)


def occupied(x, y):
    return (
        player_unit(x, y) is not None
        or enemy_unit(x, y) is not None
        or (x, y) in (PLAYER_BASE, ENEMY_BASE)
    )

# ==================================================
# ユニット作成
# ==================================================

def create_unit(kind, x, y):
    data = UNITS[kind]
    return {
        "type": kind,
        "x": x,
        "y": y,
        "hp": data["hp"],
        "max_hp": data["hp"],
        "attack": data["attack"],
        "range": data["range"],
        "move": data["move"],
        "moved": False,
        "attacked": False,
    }

# ==================================================
# 召喚
# ==================================================

def summon(kind, enemy=False, spawn_x=None, spawn_y=None):
    global energy, enemy_energy

    cost = UNITS[kind]["cost"]
    current_energy = enemy_energy if enemy else energy

    if current_energy < cost:
        return False

    if enemy:
        columns = [spawn_x] if spawn_x is not None else ENEMY_SUMMON_COLUMNS
    else:
        columns = [spawn_x] if spawn_x is not None else PLAYER_SUMMON_COLUMNS

    rows = [spawn_y] if spawn_y is not None else range(ROWS)

    for x in columns:
        for y in rows:
            if not (0 <= x < COLS and 0 <= y < ROWS):
                continue
            if occupied(x, y):
                continue

            unit = create_unit(kind, x, y)

            if enemy:
                enemy_warriors.append(unit)
                enemy_energy -= cost
            else:
                warriors.append(unit)
                energy -= cost

            return True

    return False

# ==================================================
# マウス → マス
# ==================================================

def mouse_cell(pos):
    mx, my = pos

    if not (BOARD_X <= mx < BOARD_X + COLS * CELL_SIZE):
        return None
    if not (BOARD_Y <= my < BOARD_Y + ROWS * CELL_SIZE):
        return None

    return (
        (mx - BOARD_X) // CELL_SIZE,
        (my - BOARD_Y) // CELL_SIZE,
    )

# ==================================================
# 移動経路
# ==================================================

def path_clear(unit, tx, ty):
    sx, sy = unit["x"], unit["y"]
    queue = [(sx, sy, 0)]
    seen = {(sx, sy)}

    directions = [
        (1, 0),
        (-1, 0),
        (0, 1),
        (0, -1),
    ]

    while queue:
        x, y, steps = queue.pop(0)

        if (x, y) == (tx, ty):
            return True

        if steps >= unit["move"]:
            continue

        for dx, dy in directions:
            nx, ny = x + dx, y + dy

            if not (0 <= nx < COLS and 0 <= ny < ROWS):
                continue
            if (nx, ny) in seen:
                continue
            if (nx, ny) != (tx, ty) and occupied(nx, ny):
                continue

            seen.add((nx, ny))
            queue.append((nx, ny, steps + 1))

    return False

# ==================================================
# 移動可能か
# ==================================================

def can_move(unit, tx, ty):
    if unit["moved"]:
        return False
    if not (0 <= tx < COLS and 0 <= ty < ROWS):
        return False
    if (tx, ty) in (PLAYER_BASE, ENEMY_BASE):
        return False
    if occupied(tx, ty):
        return False

    if unit["type"] == "Warrior":
        if circle_distance(unit["x"], unit["y"], tx, ty) > unit["move"]:
            return False

    elif unit["type"] == "Cavalry":
        if unit["x"] != tx and unit["y"] != ty:
            return False
        if distance(unit["x"], unit["y"], tx, ty) > unit["move"]:
            return False

    else:
        if distance(unit["x"], unit["y"], tx, ty) > unit["move"]:
            return False

    return path_clear(unit, tx, ty)

# ==================================================
# 移動
# ==================================================

def move(unit, tx, ty):
    if not can_move(unit, tx, ty):
        return False

    unit["x"] = tx
    unit["y"] = ty
    unit["moved"] = True
    return True

# ==================================================
# 攻撃
# ==================================================

def attack(attacker, target):
    if attacker["attacked"]:
        return False

    d = distance(
        attacker["x"], attacker["y"],
        target["x"], target["y"],
    )

    if attacker["type"] == "Archer":
        if not (2 <= d <= attacker["range"]):
            return False
    elif d > attacker["range"]:
        return False

    target["hp"] -= attacker["attack"]
    attacker["attacked"] = True

    if target["hp"] <= 0:
        if target in warriors:
            warriors.remove(target)
        if target in enemy_warriors:
            enemy_warriors.remove(target)

    return True

# ==================================================
# 基地攻撃
# ==================================================

def attack_base(attacker, enemy_base=True):
    global player_hp, enemy_hp

    if attacker["attacked"]:
        return False

    bx, by = ENEMY_BASE if enemy_base else PLAYER_BASE
    d = distance(attacker["x"], attacker["y"], bx, by)

    if attacker["type"] == "Archer":
        if not (2 <= d <= attacker["range"]):
            return False
    elif d > attacker["range"]:
        return False

    if enemy_base:
        enemy_hp = max(0, enemy_hp - attacker["attack"])
    else:
        player_hp = max(0, player_hp - attacker["attack"])

    attacker["attacked"] = True
    return True

# ==================================================
# AI：攻撃対象
# ==================================================

def find_attack_targets(enemy):
    targets = []

    for player in warriors:
        d = distance(
            enemy["x"], enemy["y"],
            player["x"], player["y"],
        )

        if enemy["type"] == "Archer":
            can_hit = 2 <= d <= enemy["range"]
        else:
            can_hit = d <= enemy["range"]

        if can_hit:
            targets.append(player)

    return targets


def best_attack(enemy):
    targets = find_attack_targets(enemy)

    if not targets:
        return None

    killable = [
        t for t in targets
        if t["hp"] <= enemy["attack"]
    ]

    if killable:
        return min(killable, key=lambda t: t["hp"])

    if difficulty == "easy":
        return random.choice(targets)

    if difficulty == "hard":
        return max(
            targets,
            key=lambda t: (
                t["attack"],
                -t["hp"],
                -t["x"],
            ),
        )

    if difficulty == "oni":
        return max(
            targets,
            key=lambda t: (
                t["attack"] * 30,
                -t["hp"] * 2,
                -t["x"],
            ),
        )

    return min(targets, key=lambda t: t["hp"])

# ==================================================
# AI：移動
# ==================================================

def best_move(enemy):
    if enemy["moved"] or not warriors:
        return None

    candidates = []

    for y in range(ROWS):
        for x in range(COLS):
            if not can_move(enemy, x, y):
                continue

            score = 0

            nearest = min(
                distance(x, y, p["x"], p["y"])
                for p in warriors
            )
            score -= nearest * 5

            base_distance = distance(
                x, y,
                PLAYER_BASE[0], PLAYER_BASE[1]
            )

            # 城へ進むことを強く優先する
            if difficulty == "easy":
                score -= base_distance * 6
            elif difficulty == "normal":
                score -= base_distance * 8
            elif difficulty == "hard":
                score -= base_distance * 10
            else:
                score -= base_distance * 13

            for p in warriors:
                d = distance(x, y, p["x"], p["y"])

                if enemy["type"] == "Archer":
                    can_hit = 2 <= d <= enemy["range"]
                else:
                    can_hit = d <= enemy["range"]

                if can_hit:
                    score += 80

                    if p["hp"] <= enemy["attack"]:
                        score += 100

                    if difficulty == "hard":
                        score += p["attack"] * 10
                    elif difficulty == "oni":
                        score += p["attack"] * 22

                if enemy["type"] == "Archer":
                    if d == 1:
                        score -= 30
                    elif 2 <= d <= enemy["range"]:
                        score += 20

            if difficulty == "easy":
                score += random.randint(-25, 25)
            elif difficulty == "normal":
                score += random.randint(-8, 8)
            elif difficulty == "hard":
                score += random.randint(-2, 2)
            else:
                for p in warriors:
                    d = distance(x, y, p["x"], p["y"])
                    score += p["attack"] * 10
                    if d <= enemy["range"]:
                        score += 35
                        if p["hp"] <= enemy["attack"]:
                            score += 150

            candidates.append((score, x, y))

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0], reverse=True)

    if difficulty == "easy":
        top = candidates[: min(4, len(candidates))]
        choice = random.choice(top)
        return choice[1], choice[2]

    return candidates[0][1], candidates[0][2]

# ==================================================
# AI：数を数える
# ==================================================

def unit_count(units, kind):
    return sum(1 for u in units if u["type"] == kind)


def enemy_count(kind):
    return unit_count(enemy_warriors, kind)


def player_count(kind):
    return unit_count(warriors, kind)

# ==================================================
# AI：召喚するユニットを決める
# ==================================================

def choose_enemy_unit():
    affordable = [
        kind
        for kind, data in UNITS.items()
        if enemy_energy >= data["cost"]
    ]

    if not affordable:
        return None

    infantry_count = enemy_count("Infantry")
    warrior_count = enemy_count("Warrior")
    tank_count = enemy_count("Tank")
    archer_count = enemy_count("Archer")
    cavalry_count = enemy_count("Cavalry")

    player_infantry = player_count("Infantry")
    player_warrior = player_count("Warrior")
    player_tank = player_count("Tank")
    player_archer = player_count("Archer")
    player_cavalry = player_count("Cavalry")

    # 弓兵は基本1体まで
    if archer_count >= 1:
        no_more_archer = [
            k for k in affordable
            if k != "Archer"
        ]
        if no_more_archer:
            affordable = no_more_archer

    # ==================================================
    # かんたん
    # ==================================================
    if difficulty == "easy":
        weights = []
        for kind in affordable:
            count = enemy_count(kind)
            if kind == "Infantry":
                weight = max(2, 5 - count)
            else:
                weight = max(1, 5 - count * 2)
            weights.append(weight)

        return random.choices(
            affordable,
            weights=weights,
            k=1,
        )[0]

    # ==================================================
    # ふつう
    # ==================================================
    if difficulty == "normal":
        # 弓兵には重戦士
        if player_archer >= 1 and "Tank" in affordable:
            return "Tank"

        # 重戦士には騎兵
        if player_tank >= 2 and "Cavalry" in affordable:
            return "Cavalry"

        # 騎兵には重戦士
        if player_cavalry >= 2 and "Tank" in affordable:
            return "Tank"

        # 戦士には重戦士
        if player_warrior >= 2 and "Tank" in affordable:
            return "Tank"

        # プレイヤーが歩兵だらけなら戦士か重戦士
        if player_infantry >= 3 and "Warrior" in affordable:
            return "Warrior"

        if tank_count == 0 and "Tank" in affordable:
            return "Tank"

        if enemy_energy == 1 and "Infantry" in affordable:
            return "Infantry"

        choices = [
            k for k in affordable
            if k != "Archer"
        ]

        return random.choice(choices or affordable)

    # ==================================================
    # むずかしい
    # ==================================================
    if difficulty == "hard":
        scores = {}

        for kind in affordable:
            score = 0

            if kind == "Archer":
                score -= 30
                score -= archer_count * 60
                score += player_archer * 15

            elif kind == "Cavalry":
                score += player_tank * 35
                score += player_archer * 25
                score -= cavalry_count * 8

            elif kind == "Tank":
                score += player_archer * 75
                score += player_warrior * 20
                score += player_cavalry * 10
                score += player_infantry * 5
                score += 15
                score -= tank_count * 6

            elif kind == "Warrior":
                score += player_cavalry * 20
                score += player_infantry * 15
                score += 15
                score -= warrior_count * 5

            elif kind == "Infantry":
                score += 8
                score -= infantry_count * 3
                if enemy_energy <= 2:
                    score += 30

            scores[kind] = score

        best = max(scores.values())
        best_units = [
            k for k, score in scores.items()
            if score == best
        ]

        return random.choice(best_units)

    # ==================================================
    # 鬼
    # ==================================================
    scores = {}

    for kind in affordable:
        score = 0

        if kind == "Tank":
            # 弓兵を最優先で対策
            score += player_archer * 110
            score += player_warrior * 35
            score += player_cavalry * 25
            score += player_infantry * 12
            score -= tank_count * 12

        elif kind == "Cavalry":
            # 重戦士対策
            score += player_tank * 100
            score += player_archer * 35
            score -= cavalry_count * 12

        elif kind == "Warrior":
            # 騎兵と歩兵への対処
            score += player_cavalry * 55
            score += player_infantry * 20
            score += 20
            score -= warrior_count * 8

        elif kind == "Infantry":
            score += 5
            score -= infantry_count * 8
            if enemy_energy <= 2:
                score += 45
            if len(warriors) >= 4:
                score += 15

        elif kind == "Archer":
            score -= 50
            score -= archer_count * 25
            # 重戦士への補助火力
            score += player_tank * 10

        scores[kind] = score

    best = max(scores.values())
    best_units = [
        k for k, score in scores.items()
        if score == best
    ]

    # 同点時の優先順位
    for kind in (
        "Tank",
        "Cavalry",
        "Warrior",
        "Infantry",
        "Archer",
    ):
        if kind in best_units:
            return kind

    return best_units[0]

# ==================================================
# 敵召喚
# ==================================================

def enemy_spawn():
    kind = choose_enemy_unit()

    if kind is None:
        return False

    # 左右2列のうち空いている場所へ出す
    return summon(kind, True)

# ==================================================
# 敵ターン
# ==================================================

def enemy_turn():
    global turn

    turn = "enemy"

    for enemy in enemy_warriors[:]:
        if enemy not in enemy_warriors:
            continue

        target = best_attack(enemy)

        if target is not None:
            attack(enemy, target)
            continue

        if attack_base(enemy, False):
            continue

        pos = best_move(enemy)

        if pos is not None:
            move(enemy, pos[0], pos[1])

        target = best_attack(enemy)

        if target is not None:
            attack(enemy, target)
        else:
            attack_base(enemy, False)

    enemy_spawn()
    start_player_turn()

# ==================================================
# プレイヤーターン開始
# ==================================================

def start_player_turn():
    global turn
    global turn_number
    global energy
    global enemy_energy
    global selected_unit
    global summon_mode

    turn = "player"
    turn_number += 1

    # プレイヤーと敵は同じだけエネルギーを得る
    energy = min(
        MAX_ENERGY,
        energy + ENERGY_PER_TURN,
    )

    enemy_energy = min(
        MAX_ENERGY,
        enemy_energy + ENERGY_PER_TURN,
    )

    for unit in warriors + enemy_warriors:
        unit["moved"] = False
        unit["attacked"] = False

    selected_unit = None
    summon_mode = None

# ==================================================
# 新しいゲーム
# ==================================================

def new_game():
    global player_hp
    global enemy_hp
    global energy
    global enemy_energy
    global turn
    global turn_number
    global game_won
    global game_lost
    global warriors
    global enemy_warriors
    global selected_unit
    global summon_mode

    player_hp = 10
    enemy_hp = 10
    energy = START_ENERGY
    enemy_energy = START_ENERGY
    turn = "player"
    turn_number = 1
    game_won = False
    game_lost = False
    warriors = []
    enemy_warriors = []
    selected_unit = None
    summon_mode = None

    # ゲーム開始時に歩兵を縦一列に配置
    # プレイヤー側：召喚ゾーンの外側の列 x=1
    for y in range(ROWS):
        warriors.append(
            create_unit(
                "Infantry",
                PLAYER_SUMMON_COLUMNS[0],
                y
            )
        )

    # 敵側：召喚ゾーンの外側の列 x=10
    for y in range(ROWS):
        enemy_warriors.append(
            create_unit(
                "Infantry",
                ENEMY_SUMMON_COLUMNS[-1],
                y
            )
        )

# ==================================================
# 表示ヘルパー
# ==================================================

def draw_center_text(
    text,
    y,
    used_font,
    color=(255, 255, 255),
):
    surface = used_font.render(
        text,
        True,
        color,
    )
    screen.blit(
        surface,
        surface.get_rect(
            center=(WIDTH // 2, y)
        ),
    )


def draw_button(
    rect,
    text,
    color,
    used_font=font,
):
    pygame.draw.rect(
        screen,
        color,
        rect,
    )
    pygame.draw.rect(
        screen,
        (140, 140, 150),
        rect,
        2,
    )

    surface = used_font.render(
        text,
        True,
        (255, 255, 255),
    )

    screen.blit(
        surface,
        surface.get_rect(
            center=rect.center
        ),
    )

# ==================================================
# ホーム画面
# ==================================================

def draw_home():
    screen.fill(
        (25, 25, 35)
    )

    draw_center_text(
        "ENERGY BATTLE",
        65,
        title_font,
        (255, 220, 70),
    )

    draw_center_text(
        "ターン制ボードバトル",
        110,
        font,
        (200, 200, 210),
    )

    draw_button(
        start_button,
        "ゲームスタート",
        (60, 130, 80),
    )

    draw_button(
        howto_button,
        "あそびかた",
        (60, 90, 150),
    )

    draw_button(
        quit_button,
        "終了",
        (130, 60, 60),
    )

    draw_center_text(
        "難易度を選択",
        360,
        small_font,
        (255, 220, 70),
    )

    for kind, rect in difficulty_buttons.items():
        color = (
            (150, 120, 50)
            if difficulty == kind
            else
            (60, 60, 75)
        )

        draw_button(
            rect,
            DIFFICULTIES[kind],
            color,
            small_font,
        )

    draw_center_text(
        "全難易度でリソースは同じ。違うのはボットの賢さだけ！",
        445,
        tiny_font,
        (180, 220, 255),
    )

# ==================================================
# あそびかた：ユニット見た目
# ==================================================

def draw_preview_unit(kind, x, y):
    if kind == "Infantry":
        pygame.draw.rect(
            screen,
            (110, 110, 120),
            (x - 13, y - 13, 26, 26),
        )

    elif kind == "Warrior":
        pygame.draw.circle(
            screen,
            (50, 110, 220),
            (x, y),
            18,
        )

    elif kind == "Tank":
        pygame.draw.rect(
            screen,
            (40, 140, 220),
            (x - 18, y - 18, 36, 36),
        )

    elif kind == "Archer":
        pygame.draw.polygon(
            screen,
            (40, 175, 220),
            [
                (x, y - 20),
                (x + 19, y + 18),
                (x - 19, y + 18),
            ],
        )

    elif kind == "Cavalry":
        pygame.draw.circle(
            screen,
            (140, 75, 200),
            (x, y),
            19,
        )

# ==================================================
# あそびかた：ユニットカード
# ==================================================

def draw_unit_card(kind, x, y):
    width = 132
    height = 108

    pygame.draw.rect(
        screen,
        (55, 55, 70),
        (x, y, width, height),
    )

    pygame.draw.rect(
        screen,
        (120, 120, 135),
        (x, y, width, height),
        2,
    )

    # ユニット名
    screen.blit(
        tiny_font.render(
            NAMES[kind],
            True,
            (255, 220, 70),
        ),
        (x + 5, y + 7),
    )

    # 見た目
    draw_preview_unit(
        kind,
        x + 24,
        y + 56,
    )

    data = UNITS[kind]

    stats = [
        f"HP {data['hp']}",
        f"攻撃 {data['attack']}",
        f"射程 {data['range']}",
        f"移動 {data['move']}",
        f"コスト {data['cost']}",
    ]

    # 文字を縦につぶさず、右側に整理して表示
    for i, text in enumerate(stats):
        screen.blit(
            tiny_font.render(
                text,
                True,
                (240, 240, 240),
            ),
            (x + 48, y + 29 + i * 15),
        )

# ==================================================
# あそびかた画面
# ==================================================

def draw_howto():
    screen.fill((25, 25, 35))

    draw_center_text(
        "あそびかた",
        32,
        big_font,
        (255, 220, 70),
    )

    # 左：基本ルール
    screen.blit(
        font.render(
            "基本ルール",
            True,
            (255, 220, 70),
        ),
        (18, 78),
    )

    rules = [
        "① ユニットボタンで種類を選ぶ",
        "② 左側2列の青い場所で召喚",
        "※ 開始時：歩兵5体を縦に配置",
        "③ 自分のユニットをクリックして選択",
        "④ 緑のマスへ移動できる",
        "⑤ 赤いマスの敵を攻撃できる",
        "⑥ END TURNで敵のターンへ",
        "⑦ 敵の城HPを0にすれば勝利！",
    ]

    for i, text in enumerate(rules):
        screen.blit(
            tiny_font.render(
                text,
                True,
                (235, 235, 235),
            ),
            (18, 112 + i * 25),
        )

    # 左下：用語説明
    screen.blit(
        tiny_font.render(
            "用語",
            True,
            (255, 220, 70),
        ),
        (18, 315),
    )

    explain = [
        "HP＝体力",
        "攻撃＝1回のダメージ",
        "射程＝攻撃できる距離",
        "移動＝1ターンに移動できる距離",
        "コスト＝召喚に必要なエネルギー",
    ]

    for i, text in enumerate(explain):
        screen.blit(
            tiny_font.render(
                text,
                True,
                (190, 190, 200),
            ),
            (18, 335 + i * 18),
        )

    # 右：ユニット性能
    screen.blit(
        font.render(
            "ユニット性能",
            True,
            (255, 220, 70),
        ),
        (400, 78),
    )

    # 3 + 2 の配置。カードが画面端からはみ出さないように調整。
    draw_unit_card("Infantry", 400, 108)
    draw_unit_card("Warrior", 532, 108)
    draw_unit_card("Tank", 664, 108)
    draw_unit_card("Archer", 466, 232)
    draw_unit_card("Cavalry", 598, 232)

    draw_button(
        howto_back_button,
        "ホームへ戻る",
        (70, 90, 140),
        small_font,
    )

# ==================================================
# オーバーレイ
# ==================================================

def draw_overlay(x, y, color):
    surface = pygame.Surface(
        (CELL_SIZE, CELL_SIZE),
        pygame.SRCALPHA,
    )
    surface.fill(color)
    screen.blit(
        surface,
        (
            BOARD_X + x * CELL_SIZE,
            BOARD_Y + y * CELL_SIZE,
        ),
    )

# ==================================================
# ユニット描画
# ==================================================

def draw_unit(unit, enemy=False):
    px = BOARD_X + unit["x"] * CELL_SIZE + 8
    py = BOARD_Y + unit["y"] * CELL_SIZE + 8
    size = CELL_SIZE - 16
    center = (
        px + size // 2,
        py + size // 2,
    )

    colors = {
        "Infantry": (110, 110, 120),
        "Warrior": (50, 100, 220) if enemy else (220, 60, 60),
        "Tank": (180, 120, 50),
        "Archer": (40, 170, 220),
        "Cavalry": (140, 70, 200),
    }

    color = colors[unit["type"]]

    if unit["type"] == "Infantry":
        pygame.draw.rect(
            screen,
            color,
            (px + 9, py + 9, size - 18, size - 18),
        )
    elif unit["type"] == "Warrior":
        pygame.draw.circle(
            screen,
            color,
            center,
            20,
        )
    elif unit["type"] == "Tank":
        pygame.draw.rect(
            screen,
            color,
            (px + 4, py + 4, size - 8, size - 8),
        )
    elif unit["type"] == "Archer":
        pygame.draw.polygon(
            screen,
            color,
            [
                (center[0], py + 2),
                (px + size - 2, py + size - 2),
                (px + 2, py + size - 2),
            ],
        )
    else:
        pygame.draw.circle(
            screen,
            color,
            center,
            22,
        )

    if unit == selected_unit:
        pygame.draw.rect(
            screen,
            (255, 220, 50),
            (px, py, size, size),
            3,
        )

    hp_width = int(
        size * unit["hp"] / unit["max_hp"]
    )

    pygame.draw.rect(
        screen,
        (30, 30, 30),
        (px, py - 7, size, 5),
    )

    pygame.draw.rect(
        screen,
        (50, 210, 70),
        (px, py - 7, hp_width, 5),
    )

    name = tiny_font.render(
        NAMES[unit["type"]],
        True,
        (255, 255, 255),
    )

    screen.blit(
        name,
        name.get_rect(center=center),
    )

# ==================================================
# ゲーム画面
# ==================================================

def draw_game():
    screen.fill((30, 30, 38))

    # 上部UI
    top_items = [
        (f"自分 HP: {player_hp}", 10, (255, 255, 255)),
        (f"敵 HP: {enemy_hp}", 145, (255, 120, 120)),
        (f"エネルギー: {energy}/10", 250, (255, 220, 50)),
        (
            f"ターン: {'あなた' if turn == 'player' else '敵'} {turn_number}",
            410,
            (255, 255, 255),
        ),
        (
            f"難易度: {DIFFICULTIES[difficulty]}",
            650,
            (180, 220, 255),
        ),
    ]

    for text, x, color in top_items:
        screen.blit(
            tiny_font.render(text, True, color),
            (x, 10),
        )

    # ボード
    for y in range(ROWS):
        for x in range(COLS):
            rect = pygame.Rect(
                BOARD_X + x * CELL_SIZE,
                BOARD_Y + y * CELL_SIZE,
                CELL_SIZE,
                CELL_SIZE,
            )

            pygame.draw.rect(
                screen,
                (70, 70, 80),
                rect,
            )

            # 両軍の召喚エリア
            if x in PLAYER_SUMMON_COLUMNS:
                color = (
                    (70, 150, 90)
                    if summon_mode and not occupied(x, y)
                    else
                    (120, 70, 70)
                    if summon_mode
                    else
                    (40, 80, 140)
                )
                pygame.draw.rect(screen, color, rect)
                pygame.draw.rect(
                    screen,
                    (100, 150, 230),
                    rect,
                    2,
                )

            elif x in ENEMY_SUMMON_COLUMNS:
                pygame.draw.rect(
                    screen,
                    (80, 55, 100),
                    rect,
                )
                pygame.draw.rect(
                    screen,
                    (150, 100, 180),
                    rect,
                    2,
                )

    # 移動範囲
    if selected_unit and not selected_unit["moved"]:
        for y in range(ROWS):
            for x in range(COLS):
                if can_move(selected_unit, x, y):
                    draw_overlay(
                        x,
                        y,
                        (0, 255, 0, 65),
                    )

    # 攻撃範囲
    if selected_unit and not selected_unit["attacked"]:
        for enemy in enemy_warriors:
            d = distance(
                selected_unit["x"],
                selected_unit["y"],
                enemy["x"],
                enemy["y"],
            )

            can_hit = (
                2 <= d <= selected_unit["range"]
                if selected_unit["type"] == "Archer"
                else d <= selected_unit["range"]
            )

            if can_hit:
                draw_overlay(
                    enemy["x"],
                    enemy["y"],
                    (255, 0, 0, 70),
                )

        bx, by = ENEMY_BASE
        d = distance(
            selected_unit["x"],
            selected_unit["y"],
            bx,
            by,
        )

        can_hit = (
            2 <= d <= selected_unit["range"]
            if selected_unit["type"] == "Archer"
            else d <= selected_unit["range"]
        )

        if can_hit:
            draw_overlay(
                bx,
                by,
                (255, 0, 0, 70),
            )

    # グリッド
    for y in range(ROWS):
        for x in range(COLS):
            pygame.draw.rect(
                screen,
                (105, 105, 115),
                (
                    BOARD_X + x * CELL_SIZE,
                    BOARD_Y + y * CELL_SIZE,
                    CELL_SIZE,
                    CELL_SIZE,
                ),
                1,
            )

    # 基地
    player_rect = pygame.Rect(
        BOARD_X,
        BOARD_Y + 2 * CELL_SIZE,
        CELL_SIZE,
        CELL_SIZE,
    )

    enemy_rect = pygame.Rect(
        BOARD_X + ENEMY_BASE[0] * CELL_SIZE,
        BOARD_Y + ENEMY_BASE[1] * CELL_SIZE,
        CELL_SIZE,
        CELL_SIZE,
    )

    pygame.draw.rect(
        screen,
        (30, 130, 70),
        player_rect,
    )

    pygame.draw.rect(
        screen,
        (180, 55, 55),
        enemy_rect,
    )

    screen.blit(
        tiny_font.render(
            "自分の城",
            True,
            (255, 255, 255),
        ),
        (player_rect.x + 4, player_rect.y + 20),
    )

    screen.blit(
        tiny_font.render(
            "敵の城",
            True,
            (255, 255, 255),
        ),
        (enemy_rect.x + 8, enemy_rect.y + 20),
    )

    # ユニット
    for unit in warriors:
        draw_unit(unit, False)

    for unit in enemy_warriors:
        draw_unit(unit, True)

    # 召喚ボタン
    button_colors = {
        "Infantry": (100, 105, 115),
        "Warrior": (80, 100, 170),
        "Tank": (130, 100, 60),
        "Archer": (40, 130, 170),
        "Cavalry": (120, 70, 160),
    }

    for kind, rect in buttons.items():
        color = (
            (180, 150, 50)
            if summon_mode == kind
            else button_colors[kind]
        )

        draw_button(
            rect,
            f"{NAMES[kind]} {UNITS[kind]['cost']}",
            color,
            tiny_font,
        )

    draw_button(
        end_turn_button,
        "ターン終了",
        (90, 120, 70),
        tiny_font,
    )

    draw_button(
        home_game_button,
        "ホーム",
        (70, 70, 90),
        tiny_font,
    )

    # 下部説明
    if selected_unit:
        u = selected_unit
        text = (
            f"{NAMES[u['type']]} "
            f"HP:{u['hp']}/{u['max_hp']} "
            f"攻撃:{u['attack']} "
            f"移動:{'可能' if not u['moved'] else '済み'} "
            f"攻撃:{'可能' if not u['attacked'] else '済み'}"
        )
    elif summon_mode:
        text = f"{NAMES[summon_mode]}を召喚する場所を選択"
    else:
        text = "ユニットをクリックして選択してください"

    screen.blit(
        tiny_font.render(
            text,
            True,
            (235, 235, 235),
        ),
        (20, 445),
    )

    # 勝敗
    if game_won or game_lost:
        pygame.draw.rect(
            screen,
            (20, 20, 30),
            (250, 190, 300, 100),
        )

        draw_center_text(
            "勝利！" if game_won else "敗北…",
            235,
            big_font,
            (255, 220, 50) if game_won else (255, 100, 100),
        )

        draw_center_text(
            "ホームで再戦できます",
            275,
            small_font,
            (230, 230, 230),
        )

# ==================================================
# メインループ
# ==================================================

running = True

while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
            continue

        if event.type != pygame.MOUSEBUTTONDOWN:
            continue

        mouse_pos = event.pos

        # ==================================================
        # ホーム
        # ==================================================
        if screen_mode == "home":
            if start_button.collidepoint(mouse_pos):
                new_game()
                screen_mode = "game"
                continue

            if howto_button.collidepoint(mouse_pos):
                screen_mode = "howto"
                continue

            if quit_button.collidepoint(mouse_pos):
                running = False
                continue

            for kind, rect in difficulty_buttons.items():
                if rect.collidepoint(mouse_pos):
                    difficulty = kind
                    break

            continue

        # ==================================================
        # あそびかた
        # ==================================================
        if screen_mode == "howto":
            if howto_back_button.collidepoint(mouse_pos):
                screen_mode = "home"
            continue

        # ==================================================
        # ゲーム
        # ==================================================
        if screen_mode != "game":
            continue

        if game_won or game_lost:
            if home_game_button.collidepoint(mouse_pos):
                new_game()
                screen_mode = "home"
            continue

        if turn != "player":
            continue

        if home_game_button.collidepoint(mouse_pos):
            new_game()
            screen_mode = "home"
            continue

        # 召喚ボタン
        clicked_summon = False

        for kind, rect in buttons.items():
            if rect.collidepoint(mouse_pos):
                clicked_summon = True

                if energy >= UNITS[kind]["cost"]:
                    if summon_mode == kind:
                        summon_mode = None
                    else:
                        summon_mode = kind
                        selected_unit = None

                break

        if clicked_summon:
            continue

        # ターン終了
        if end_turn_button.collidepoint(mouse_pos):
            summon_mode = None
            selected_unit = None

            enemy_turn()

            if enemy_hp <= 0:
                game_won = True

            if player_hp <= 0:
                game_lost = True

            continue

        cell = mouse_cell(mouse_pos)
        if cell is None:
            continue

        x, y = cell

        # 召喚場所
        if summon_mode is not None:
            if x in PLAYER_SUMMON_COLUMNS and not occupied(x, y):
                if summon(
                    summon_mode,
                    False,
                    x,
                    y,
                ):
                    summon_mode = None
            continue

        # 自分のユニット
        unit = player_unit(x, y)

        if unit is not None:
            selected_unit = unit
            continue

        # 攻撃・移動
        if selected_unit is not None:
            enemy = enemy_unit(x, y)

            if enemy is not None:
                if attack(selected_unit, enemy):
                    selected_unit = None

            elif (x, y) == ENEMY_BASE:
                if attack_base(selected_unit, True):
                    selected_unit = None

            else:
                if move(selected_unit, x, y):
                    selected_unit = None

    # 勝敗判定
    if enemy_hp <= 0:
        game_won = True

    if player_hp <= 0:
        game_lost = True

    # 描画
    if screen_mode == "home":
        draw_home()
    elif screen_mode == "howto":
        draw_howto()
    else:
        draw_game()

    pygame.display.flip()
    clock.tick(60)

pygame.quit()
