(function (spaceCore) {
  "use strict";

  const {
    DIRECTIONS,
    CORE_X,
    CORE_Y,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    WORLD_CENTER_X,
    WORLD_CENTER_Y,
    WORLD_RADIUS,
    WORLD_MIDDLE_RADIUS,
    WORLD_CORE_RADIUS,
    WORLD_LOCAL_SPAWN_RADIUS,
    WORLD_ACTIVE_SIM_RADIUS,
    WORLD_SPAWN_RETENTION_RADIUS,
    SHIP_WORLD_SCALE,
    COLLECTION_RANGE,
    SALVAGE_COLLECTOR_RANGE,
    SALVAGE_COLLECTOR_INTERVAL,
    SHIELD_RADIUS_CELLS,
    SHIELD_REGEN_RATE,
    SHIELD_PROJECTILE_DAMAGE_RATIO,
    ENGINE_FORCE,
    TORQUE_SCALE,
    LINEAR_DAMPING,
    ANGULAR_DAMPING,
    MAX_WORLD_STEP,
    AMMO_FACTORY_INTERVAL_BY_TILE,
    AMMO_FACTORY_TILE_IDS,
    CANNON_AMMO_CAPACITY,
    CANNON_STARTING_AMMO,
    CANNON_PROJECTILE_SPEED,
    CANNON_TILE_IDS,
    CONVEYOR_TILE_IDS,
    ENGINE_FORCE_BY_TILE,
    ENGINE_TILE_IDS,
    ENEMY_SCRAP_DROP_MAX,
    ENEMY_SCRAP_DROP_MIN,
    POWER_REQUIREMENT_BY_TILE,
    POWER_GENERATOR_TILE_IDS,
    POWER_OUTPUT_BY_TILE,
    WEAPON_RANGES,
    WEAPON_TILE_IDS,
    WEAPON_COOLDOWNS,
    WEAPON_DAMAGE,
    CONVEYOR_AMMO_INTERVAL,
    CONVEYOR_AMMO_CAPACITY,
    BUILD_LOCKOUT_DISTANCE,
    PART_HIT_RADIUS,
    PIECE_HIT_RADIUS,
    PROJECTILE_HIT_RADIUS,
    WORLD_ENEMY_SPAWN_INTERVAL,
    WORLD_TRADER_SPAWN_INTERVAL,
    WORLD_MAX_ENEMIES,
    WORLD_MAX_TRADERS,
    WORLD_MAX_LOOSE_PIECES,
    WORLD_PART_SPAWN_INTERVAL,
    TRADER_ARTIFACT_CHANCE,
    TRADER_SHIP_COUNT,
    TRADER_STOCK_SLOT_COUNT,
    TRADER_REFRESH_COST,
    TRADER_TRADE_RADIUS,
  } = spaceCore.config;
  const { createTileState, ensureTileHealth, getTileMaxHp } = spaceCore.tileState;
  const { findTileById } = spaceCore.tileCatalog;

  const DIRECTION_VECTORS = {
    up: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  };
  const ENEMY_FORWARD_ENGINE = "-2,0";
  const ENEMY_TURN_CLOCKWISE_ENGINE = "-2,1";
  const ENEMY_TURN_COUNTER_CLOCKWISE_ENGINE = "-2,-1";
  const ENEMY_FIRE_ARC = 0.42;
  const ENEMY_THRUST_ARC = 0.9;
  const ENEMY_DESIRED_DISTANCE = 430;
  const ENEMY_AI_INTERVAL = 0.75;
  const LOOSE_PIECE_COUNT = 48;
  const LOOSE_PIECE_TILE_POOL = [
    "ship-scaffold",
    "electric-cable",
    "ship-scaffold",
    "conveyor-belt",
    "splitter-conveyor",
    "engine",
    "power-generator",
    "fusion-generator",
    "shield-block",
    "laser",
    "pulse-laser",
    "ship-scaffold",
    "electric-cable",
    "ammo-factory",
    "repair-bot-block",
    "salvage-collector",
    "rapid-ammo-factory",
    "cannon",
    "railgun",
    "conveyor-belt",
    "splitter-conveyor",
    "beam-laser",
    "overdrive-engine",
    "quantum-thruster",
    "long-range-cannon",
  ];
  const SPLITTER_CONVEYOR_TILE_ID = "splitter-conveyor";
  const SHIELD_BLOCK_TILE_ID = "shield-block";
  const SHIELD_ABSORB_RATIO = 0.55;
  const REPAIR_BOT_TILE_ID = "repair-bot-block";
  const SALVAGE_COLLECTOR_TILE_ID = "salvage-collector";
  const REPAIR_BOT_RADIUS_CELLS = 4.25;
  const REPAIR_BOT_RATE = 8;
  const REPAIR_EFFECT_INTERVAL = 0.35;
  const REPAIR_STILL_SPEED = 5;
  const REPAIR_STILL_ANGULAR_SPEED = 0.035;
  const TRADER_WANDER_TARGET_DISTANCE_MIN = 520;
  const TRADER_WANDER_TARGET_DISTANCE_MAX = 1250;
  const TRADER_WANDER_ARRIVAL_DISTANCE = 150;
  const TRADER_WANDER_TIMER_MIN = 7;
  const TRADER_WANDER_TIMER_MAX = 16;
  const TRADER_COMBAT_DESIRED_DISTANCE = 520;
  const MAX_WORLD_PROJECTILES = 180;
  const MAX_WORLD_WEAPON_EFFECTS = 140;
  const TRADER_STOCK_TILE_POOL = [
    "ship-scaffold",
    "electric-cable",
    "conveyor-belt",
    "splitter-conveyor",
    "engine",
    "power-generator",
    "shield-block",
    "repair-bot-block",
    "salvage-collector",
    "laser",
    "cannon",
    "ammo-factory",
    "overdrive-engine",
    "beam-laser",
    "pulse-laser",
    "long-range-cannon",
    "rapid-ammo-factory",
    "fusion-generator",
    "railgun",
    "quantum-thruster",
  ];
  const TRADER_SHIP_TEMPLATE = [
    [0, 0, "core"],
    [-1, 0, "ship-scaffold", "fusion-generator"],
    [-1, -1, "ship-scaffold", "fusion-generator"],
    [-1, 1, "ship-scaffold", "power-generator"],
    [0, -1, "ship-scaffold", "shield-block"],
    [0, 1, "ship-scaffold", "rapid-ammo-factory", "right"],
    [0, 2, "ship-scaffold"],
    [1, -1, "ship-scaffold"],
    [1, 0, "ship-scaffold", "conveyor-belt", "right"],
    [1, 1, "ship-scaffold", "splitter-conveyor", "right"],
    [1, 2, "ship-scaffold", "conveyor-belt", "right"],
    [2, -1, "ship-scaffold", "beam-laser"],
    [2, 0, "ship-scaffold", "long-range-cannon"],
    [2, 1, "ship-scaffold", "cannon"],
    [2, 2, "ship-scaffold", "cannon"],
    [-2, 0, "ship-scaffold", "overdrive-engine", "right"],
    [-2, -1, "ship-scaffold", "engine", "down"],
    [-2, 1, "ship-scaffold", "engine", "up"],
  ];
  const ENEMY_SHIP_TEMPLATES = [
    {
      id: "raider",
      zone: "outer",
      cells: [
        [0, 0, "core"],
        [-1, 0, "ship-scaffold", "fusion-generator"],
        [-1, -1, "ship-scaffold"],
        [-1, 1, "ship-scaffold"],
        [0, -1, "ship-scaffold"],
        [0, 1, "ship-scaffold", "ammo-factory", "right"],
        [1, -1, "ship-scaffold", "laser"],
        [1, 0, "ship-scaffold"],
        [1, 1, "ship-scaffold", "conveyor-belt", "right"],
        [2, 1, "ship-scaffold", "cannon"],
        [-2, 0, "ship-scaffold", "engine", "right"],
        [-2, -1, "ship-scaffold", "engine", "down"],
        [-2, 1, "ship-scaffold", "engine", "up"],
      ],
    },
    {
      id: "bruiser",
      zone: "outer",
      cells: [
        [0, 0, "core"],
        [-1, 0, "ship-scaffold", "fusion-generator"],
        [-1, -1, "ship-scaffold", "power-generator"],
        [-1, 1, "ship-scaffold", "fusion-generator"],
        [0, -1, "ship-scaffold", "shield-block"],
        [0, 1, "ship-scaffold", "ammo-factory", "right"],
        [0, 2, "ship-scaffold"],
        [1, -1, "ship-scaffold"],
        [1, 0, "ship-scaffold", "conveyor-belt", "right"],
        [1, 1, "ship-scaffold", "splitter-conveyor", "right"],
        [1, 2, "ship-scaffold", "conveyor-belt", "right"],
        [2, -1, "ship-scaffold", "laser"],
        [2, 0, "ship-scaffold", "cannon"],
        [2, 1, "ship-scaffold", "long-range-cannon"],
        [2, 2, "ship-scaffold", "cannon"],
        [-2, 0, "ship-scaffold", "engine", "right"],
        [-2, -1, "ship-scaffold", "engine", "down"],
        [-2, 1, "ship-scaffold", "engine", "up"],
      ],
    },
    {
      id: "beamwing",
      zone: "middle",
      cells: [
        [0, 0, "core"],
        [-1, 0, "ship-scaffold", "fusion-generator"],
        [-1, -1, "ship-scaffold", "fusion-generator"],
        [-1, 1, "ship-scaffold", "shield-block"],
        [0, -2, "ship-scaffold"],
        [0, -1, "ship-scaffold"],
        [0, 1, "ship-scaffold"],
        [0, 2, "ship-scaffold"],
        [1, -2, "ship-scaffold"],
        [1, -1, "ship-scaffold"],
        [1, 0, "ship-scaffold", "laser"],
        [1, 1, "ship-scaffold"],
        [1, 2, "ship-scaffold"],
        [2, -2, "ship-scaffold", "beam-laser"],
        [2, -1, "ship-scaffold", "pulse-laser"],
        [2, 1, "ship-scaffold", "pulse-laser"],
        [2, 2, "ship-scaffold", "beam-laser"],
        [-2, 0, "ship-scaffold", "overdrive-engine", "right"],
        [-2, -1, "ship-scaffold", "engine", "down"],
        [-2, 1, "ship-scaffold", "engine", "up"],
      ],
    },
    {
      id: "artillery",
      zone: "middle",
      cells: [
        [0, 0, "core"],
        [-1, 0, "ship-scaffold", "fusion-generator"],
        [-1, -1, "ship-scaffold", "fusion-generator"],
        [-1, 1, "ship-scaffold", "fusion-generator"],
        [0, -1, "ship-scaffold", "shield-block"],
        [0, 1, "ship-scaffold", "rapid-ammo-factory", "right"],
        [0, 2, "ship-scaffold"],
        [1, -1, "ship-scaffold"],
        [1, 0, "ship-scaffold", "conveyor-belt", "right"],
        [1, 1, "ship-scaffold", "splitter-conveyor", "right"],
        [1, 2, "ship-scaffold", "conveyor-belt", "right"],
        [2, -1, "ship-scaffold", "beam-laser"],
        [2, 0, "ship-scaffold", "railgun"],
        [2, 1, "ship-scaffold", "long-range-cannon"],
        [2, 2, "ship-scaffold", "cannon"],
        [-2, 0, "ship-scaffold", "engine", "right"],
        [-2, -1, "ship-scaffold", "engine", "down"],
        [-2, 1, "ship-scaffold", "engine", "up"],
        [-3, 0, "ship-scaffold"],
      ],
    },
    {
      id: "carrier",
      zone: "middle",
      cells: [
        [0, 0, "core"],
        [-1, 0, "ship-scaffold", "fusion-generator"],
        [-1, -1, "ship-scaffold", "fusion-generator"],
        [-1, 1, "ship-scaffold", "shield-block"],
        [-1, 2, "ship-scaffold", "fusion-generator"],
        [0, -3, "ship-scaffold"],
        [0, -2, "ship-scaffold", "rapid-ammo-factory", "right"],
        [0, -1, "ship-scaffold"],
        [0, 1, "ship-scaffold"],
        [0, 2, "ship-scaffold", "rapid-ammo-factory", "right"],
        [0, 3, "ship-scaffold"],
        [1, -3, "ship-scaffold", "conveyor-belt", "right"],
        [1, -2, "ship-scaffold", "splitter-conveyor", "right"],
        [1, -1, "ship-scaffold", "conveyor-belt", "right"],
        [1, 0, "ship-scaffold"],
        [1, 1, "ship-scaffold", "conveyor-belt", "right"],
        [1, 2, "ship-scaffold", "splitter-conveyor", "right"],
        [1, 3, "ship-scaffold", "conveyor-belt", "right"],
        [2, -3, "ship-scaffold", "long-range-cannon"],
        [2, -2, "ship-scaffold", "cannon"],
        [2, -1, "ship-scaffold", "long-range-cannon"],
        [2, 0, "ship-scaffold", "beam-laser"],
        [2, 1, "ship-scaffold", "cannon"],
        [2, 2, "ship-scaffold", "long-range-cannon"],
        [2, 3, "ship-scaffold", "cannon"],
        [-2, 0, "ship-scaffold", "overdrive-engine", "right"],
        [-2, -1, "ship-scaffold", "engine", "down"],
        [-2, 1, "ship-scaffold", "engine", "up"],
      ],
    },
    {
      id: "skirmisher",
      zone: "middle",
      cells: [
        [0, 0, "core"],
        [-1, 0, "ship-scaffold", "fusion-generator"],
        [-1, -1, "ship-scaffold", "power-generator"],
        [-1, 1, "ship-scaffold", "fusion-generator"],
        [0, -1, "ship-scaffold"],
        [0, 1, "ship-scaffold", "shield-block"],
        [1, -1, "ship-scaffold", "pulse-laser"],
        [1, 0, "ship-scaffold", "pulse-laser"],
        [1, 1, "ship-scaffold", "pulse-laser"],
        [-2, 0, "ship-scaffold", "overdrive-engine", "right"],
        [-2, -1, "ship-scaffold", "engine", "down"],
        [-2, 1, "ship-scaffold", "engine", "up"],
      ],
    },
    {
      id: "dread",
      zone: "core",
      cells: [
        [0, 0, "core"],
        [-1, 0, "ship-scaffold", "fusion-generator"],
        [-1, -1, "ship-scaffold", "fusion-generator"],
        [-1, 1, "ship-scaffold", "fusion-generator"],
        [-1, 2, "ship-scaffold", "fusion-generator"],
        [0, -3, "ship-scaffold"],
        [0, -2, "ship-scaffold", "rapid-ammo-factory", "right"],
        [0, -1, "ship-scaffold", "shield-block"],
        [0, 1, "ship-scaffold", "shield-block"],
        [0, 2, "ship-scaffold", "rapid-ammo-factory", "right"],
        [0, 3, "ship-scaffold"],
        [1, -3, "ship-scaffold", "conveyor-belt", "right"],
        [1, -2, "ship-scaffold", "splitter-conveyor", "right"],
        [1, -1, "ship-scaffold", "conveyor-belt", "right"],
        [1, 0, "ship-scaffold"],
        [1, 1, "ship-scaffold", "conveyor-belt", "right"],
        [1, 2, "ship-scaffold", "splitter-conveyor", "right"],
        [1, 3, "ship-scaffold", "conveyor-belt", "right"],
        [2, -3, "ship-scaffold", "long-range-cannon"],
        [2, -2, "ship-scaffold", "railgun"],
        [2, -1, "ship-scaffold", "long-range-cannon"],
        [2, 0, "ship-scaffold", "beam-laser"],
        [2, 1, "ship-scaffold", "cannon"],
        [2, 2, "ship-scaffold", "railgun"],
        [2, 3, "ship-scaffold", "cannon"],
        [-2, 0, "ship-scaffold", "quantum-thruster", "right"],
        [-2, -1, "ship-scaffold", "engine", "down"],
        [-2, 1, "ship-scaffold", "engine", "up"],
        [-3, 0, "ship-scaffold"],
      ],
    },
    {
      id: "boss",
      zone: "core",
      cells: [
        [0, 0, "core"],
        [-1, 0, "ship-scaffold", "fusion-generator"],
        [-1, -1, "ship-scaffold", "fusion-generator"],
        [-1, 1, "ship-scaffold", "fusion-generator"],
        [-1, -2, "ship-scaffold", "fusion-generator"],
        [-1, 2, "ship-scaffold", "fusion-generator"],
        [0, -4, "ship-scaffold", "fusion-generator"],
        [0, 4, "ship-scaffold", "fusion-generator"],
        [0, -3, "ship-scaffold", "rapid-ammo-factory", "right"],
        [0, -2, "ship-scaffold"],
        [0, -1, "ship-scaffold", "shield-block"],
        [0, 1, "ship-scaffold", "shield-block"],
        [0, 2, "ship-scaffold"],
        [0, 3, "ship-scaffold", "rapid-ammo-factory", "right"],
        [1, -4, "ship-scaffold", "conveyor-belt", "right"],
        [1, -3, "ship-scaffold", "splitter-conveyor", "right"],
        [1, -2, "ship-scaffold", "conveyor-belt", "right"],
        [1, -1, "ship-scaffold"],
        [1, 0, "ship-scaffold"],
        [1, 1, "ship-scaffold"],
        [1, 2, "ship-scaffold", "conveyor-belt", "right"],
        [1, 3, "ship-scaffold", "splitter-conveyor", "right"],
        [1, 4, "ship-scaffold", "conveyor-belt", "right"],
        [2, -4, "ship-scaffold", "long-range-cannon"],
        [2, -3, "ship-scaffold", "railgun"],
        [2, -2, "ship-scaffold", "long-range-cannon"],
        [2, -1, "ship-scaffold"],
        [2, 0, "ship-scaffold"],
        [2, 1, "ship-scaffold"],
        [2, 2, "ship-scaffold", "long-range-cannon"],
        [2, 3, "ship-scaffold", "railgun"],
        [2, 4, "ship-scaffold", "long-range-cannon"],
        [3, -1, "ship-scaffold", "beam-laser"],
        [3, 0, "ship-scaffold", "pulse-laser"],
        [3, 1, "ship-scaffold", "beam-laser"],
        [-2, 0, "ship-scaffold", "quantum-thruster", "right"],
        [-2, -1, "ship-scaffold", "engine", "down"],
        [-2, 1, "ship-scaffold", "engine", "up"],
        [-3, 0, "ship-scaffold"],
        [-2, -2, "ship-scaffold"],
        [-2, 2, "ship-scaffold"],
      ],
    },
  ];

  function createWorldState() {
    const start = getOuterStartPoint();
    const startX = start.x;
    const startY = start.y;
    const enemies = createEnemyShips();

    return syncPrimaryEnemy({
      ship: createShipBody(startX, startY, 0),
      enemy: enemies[0],
      enemies,
      traders: createTraderShips(startX, startY),
      pieces: createInitialLoosePieces(startX, startY),
      partSpawnTimer: WORLD_PART_SPAWN_INTERVAL,
      enemySpawnTimer: WORLD_ENEMY_SPAWN_INTERVAL,
      traderSpawnTimer: WORLD_TRADER_SPAWN_INTERVAL,
      spawnedEnemyCount: enemies.length,
      spawnedPieceCount: LOOSE_PIECE_COUNT,
      spawnedTraderCount: TRADER_SHIP_COUNT,
      weaponEffects: [],
      projectiles: [],
    });
  }

  function createShipBody(x, y, angle) {
    return {
      x,
      y,
      angle,
      vx: 0,
      vy: 0,
      angularVelocity: 0,
    };
  }

  function createEnemyShips() {
    return [
      createEnemyShipAtZone("raider-alpha", "outer", 0.24, 0.82),
      createEnemyShipAtZone("bruiser-beta", "outer", 2.55, 0.68),
      createEnemyShipAtZone("beamwing-gamma", "middle", -0.62, 0.56),
      createEnemyShipAtZone("artillery-delta", "middle", 2.78, 0.44),
      createEnemyShipAtZone("dread-guard", "core", 1.85, 0.72),
      createEnemyShip("boss-prime", WORLD_CENTER_X, WORLD_CENTER_Y, Math.PI / 2, "core"),
    ];
  }

  function createEnemyShipAtZone(id, zone, angleSeed, band = 0.5) {
    const point = getPointInZone(zone, angleSeed, band);
    const angle = Math.atan2(WORLD_CENTER_Y - point.y, WORLD_CENTER_X - point.x);
    return createEnemyShip(id, point.x, point.y, angle, zone);
  }

  function createEnemyShip(id = "enemy", x = WORLD_WIDTH * 0.82, y = WORLD_HEIGHT * 0.22, angle = Math.PI, zone = null) {
    const template = getEnemyTemplate(id);
    const cells = createEnemyCells(id);
    refreshNpcPower(cells);

    return {
      id,
      body: createShipBody(x, y, angle),
      dead: false,
      aiTimer: 0,
      activeEngines: new Set(),
      zone: normalizeWorldZone(zone ?? template.zone ?? getWorldZoneAtPoint({ x, y })),
      cells,
    };
  }

  function createTraderShips(startX, startY) {
    const traders = [];

    for (let index = 0; index < TRADER_SHIP_COUNT; index += 1) {
      const point = getTraderSpawnPoint(index + 1, startX, startY);
      const angle = Math.atan2(WORLD_CENTER_Y - point.y, WORLD_CENTER_X - point.x);
      traders.push(createTraderShip(`trader-${index + 1}`, point.x, point.y, angle));
    }

    return traders;
  }

  function createTraderShip(id, x, y, angle = 0) {
    const cells = TRADER_SHIP_TEMPLATE.map(([cellX, cellY, baseId, blockId, direction]) => (
      createEnemyCell(cellX, cellY, baseId, blockId, direction)
    ));
    refreshNpcPower(cells);

    return {
      id,
      name: `Trader ${id.split("-").pop()}`,
      body: createShipBody(x, y, angle),
      dead: false,
      hostileToPlayer: false,
      aiTimer: 0,
      wanderTimer: 0,
      wanderTarget: null,
      activeEngines: new Set(),
      cells,
      stock: createTraderStock(),
    };
  }

  function getOuterStartPoint() {
    return getPointInZone("outer", Math.PI + 0.14, 0.78);
  }

  function getTraderSpawnPoint(index, startX = WORLD_CENTER_X, startY = WORLD_CENTER_Y) {
    const zone = index % 3 === 0 ? "middle" : "outer";
    const band = index % 2 === 0 ? 0.28 : 0.62;
    const point = getPointInZone(zone, index * 2.17 + 0.36, band);
    const nearStart = Math.hypot(point.x - startX, point.y - startY) < 520;

    if (!nearStart) {
      return point;
    }

    return getPointInZone(zone, index * 2.17 + Math.PI, band);
  }

  function createTraderStock() {
    return Array.from({ length: TRADER_STOCK_SLOT_COUNT }, () => createTraderStockItem());
  }

  function createTraderStockItem() {
    if (Math.random() < TRADER_ARTIFACT_CHANCE) {
      return {
        kind: "artifact",
        name: "Ancient Artifact",
        description: "A rare research relic. Its use is still mysterious.",
        quantity: 1,
        scrap: 650 + Math.floor(Math.random() * 260),
      };
    }

    const tileId = TRADER_STOCK_TILE_POOL[Math.floor(Math.random() * TRADER_STOCK_TILE_POOL.length)];
    const tile = findTileById(tileId);
    const advanced = Boolean(tile?.researchId);
    const quantity = getTraderStockQuantity(tileId, advanced);

    return {
      kind: "part",
      tileId,
      quantity,
      scrap: getTraderStockPrice(tileId, quantity, advanced),
    };
  }

  function getTraderStockQuantity(tileId, advanced) {
    if (tileId === "ship-scaffold" || tileId === "electric-cable") {
      return 3 + Math.floor(Math.random() * 4);
    }

    if (isConveyorTile(tileId)) {
      return 2 + Math.floor(Math.random() * 2);
    }

    return advanced ? 1 : 1 + Math.floor(Math.random() * 2);
  }

  function getTraderStockPrice(tileId, quantity, advanced) {
    const tile = findTileById(tileId);
    const baseCost = tile?.cost ?? 40;
    const rarity = advanced ? 2.35 : 1.85;
    return Math.max(12, Math.ceil(baseCost * rarity * quantity + 12 + Math.random() * 28));
  }

  function buyTraderStockSlot(trader, slotIndex, scrap) {
    const index = Number(slotIndex);
    const stock = Array.isArray(trader?.stock) ? trader.stock : null;
    const item = Number.isInteger(index) ? stock?.[index] : null;

    if (!trader || trader.dead || !stock || !item) {
      return { ok: false, message: "Trader stock unavailable." };
    }

    if (scrap < item.scrap) {
      return { ok: false, message: "Not enough scrap." };
    }

    stock[index] = createTraderStockItem();
    return {
      ok: true,
      item: clonePlain(item),
      nextItem: stock[index],
      scrap: scrap - item.scrap,
    };
  }

  function refreshTraderStock(trader, scrap) {
    if (!trader || trader.dead || !Array.isArray(trader.stock)) {
      return { ok: false, message: "Trader stock unavailable." };
    }

    if (scrap < TRADER_REFRESH_COST) {
      return { ok: false, message: `Refresh costs ${TRADER_REFRESH_COST} scrap.` };
    }

    trader.stock = createTraderStock();
    return {
      ok: true,
      stock: clonePlain(trader.stock),
      scrap: scrap - TRADER_REFRESH_COST,
      cost: TRADER_REFRESH_COST,
    };
  }

  function getTraderSellPrice(tileId, quantity = 1) {
    const tile = findTileById(tileId);
    const count = Math.max(1, Number(quantity) || 1);
    return Math.max(1, Math.floor(((tile?.cost ?? 20) * count) * 0.5));
  }

  function createEnemyCells(enemyId) {
    return getEnemyTemplate(enemyId).cells.map(([x, y, baseId, blockId, direction]) => (
      createEnemyCell(x, y, baseId, blockId, direction)
    ));
  }

  function getEnemyTemplate(enemyId) {
    return ENEMY_SHIP_TEMPLATES.find((template) => enemyId.includes(template.id)) ?? ENEMY_SHIP_TEMPLATES[0];
  }

  function createInitialLoosePieces(startX, startY) {
    const pieces = [
      createPiece("loose-scaffold-near-1", "ship-scaffold", startX + 80, startY - 65, false),
      createPiece("loose-cable-near-1", "electric-cable", startX + 115, startY + 25, false),
      createPiece("loose-engine-near-1", "engine", startX + 60, startY + 110, false),
      createPiece("loose-conveyor-near-1", "conveyor-belt", startX + 160, startY - 35, false),
    ];

    for (let index = 0; index < LOOSE_PIECE_COUNT; index += 1) {
      const tileId = LOOSE_PIECE_TILE_POOL[index % LOOSE_PIECE_TILE_POOL.length];
      const angle = index * 2.399963229728653 + 0.41;
      const ring = 360 + (index % 8) * 235 + Math.floor(index / 8) * 135;
      const wobbleX = Math.sin(index * 7.13) * 135;
      const wobbleY = Math.cos(index * 5.77) * 120;
      const point = clampPointToWorldCircle({
        x: startX + Math.cos(angle) * ring + wobbleX,
        y: startY + Math.sin(angle) * ring + wobbleY,
      }, 90);

      pieces.push(createPiece(`loose-${tileId}-${index + 1}`, tileId, point.x, point.y, false));
    }

    return pieces;
  }

  function createEnemyCell(x, y, baseId, blockId, direction) {
    const block = blockId && blockId !== "electric-cable" ? createEnemyBlock(blockId, direction) : null;

    return {
      x,
      y,
      base: baseId ? createTileState(baseId) : null,
      block,
      underlay: blockId === "electric-cable" || shouldNpcCellHaveCable(block?.id)
        ? createTileState("electric-cable")
        : null,
    };
  }

  function createEnemyBlock(blockId, direction) {
    const block = createTileState(blockId, { direction });

    if (CANNON_TILE_IDS.includes(blockId)) {
      block.ammo = CANNON_AMMO_CAPACITY;
    }

    if (isConveyorTile(blockId)) {
      block.ammo = 0;
    }

    if (CANNON_TILE_IDS.includes(blockId) || AMMO_FACTORY_TILE_IDS.includes(blockId) || isConveyorTile(blockId)) {
      block.ammoProgress = 0;
    }

    return block;
  }

  function shouldNpcCellHaveCable(tileId) {
    return Boolean(tileId && (requiresPower(tileId) || POWER_GENERATOR_TILE_IDS.includes(tileId)));
  }

  function refreshNpcPower(cells) {
    if (!Array.isArray(cells)) {
      return false;
    }

    let generated = 0;
    let required = 0;
    const consumers = [];

    for (const cell of cells) {
      const tileId = cell.block?.id;
      const output = getNpcPowerOutput(tileId);
      const requirement = getNpcPowerRequirement(tileId);
      generated += output;

      if (requirement > 0) {
        required += requirement;
        consumers.push(cell);
      }
    }

    const share = consumers.length > 0 ? generated / consumers.length : 0;
    const ratio = required > 0 ? Math.min(1, generated / required) : generated > 0 ? 1 : 0;
    let changed = false;

    for (const cell of cells) {
      const output = getNpcPowerOutput(cell.block?.id);
      const requirement = getNpcPowerRequirement(cell.block?.id);
      const wasPowered = Boolean(cell.powered);
      cell.powerNetworkId = 0;
      cell.powerNetworkGenerated = generated;
      cell.powerNetworkRequired = required;
      cell.powerNetworkConsumers = consumers.length;
      cell.powerShare = share;
      cell.powerRatio = ratio;
      cell.powerGenerated = output;
      cell.powerRequired = requirement;
      cell.powerReceived = requirement > 0 ? requirement * ratio : 0;
      cell.powered = requirement > 0 ? ratio >= 1 : generated > 0;

      if (wasPowered !== Boolean(cell.powered)) {
        changed = true;
      }
    }

    return changed;
  }

  function getNpcPowerOutput(tileId) {
    return POWER_GENERATOR_TILE_IDS.includes(tileId)
      ? POWER_OUTPUT_BY_TILE[tileId] ?? 0
      : 0;
  }

  function getNpcPowerRequirement(tileId) {
    return POWER_REQUIREMENT_BY_TILE[tileId] ?? 0;
  }

  function updateAmmoNetwork(board, dt, techIds = new Set()) {
    const getCellAt = (x, y) => board[y]?.[x] ?? null;
    return updateAmmoCells(board, getCellAt, dt, techIds);
  }

  function updateCellAmmoNetwork(cells, dt, techIds = new Set()) {
    const cellMap = new Map();

    for (const cell of cells ?? []) {
      cellMap.set(getLocalPartKey(cell), cell);
    }

    const getCellAt = (x, y) => cellMap.get(`${x},${y}`) ?? null;
    return updateAmmoCells(cells, getCellAt, dt, techIds);
  }

  function updateAmmoCells(cellsOrBoard, getCellAt, dt, techIds = new Set()) {
    let changed = false;

    forEachAmmoCell(cellsOrBoard, (cell) => {
      if (AMMO_FACTORY_TILE_IDS.includes(cell.block?.id)) {
        changed = updateAmmoFactory(cell, getCellAt, dt, techIds) || changed;
      }
    });

    forEachAmmoCell(cellsOrBoard, (cell) => {
      if (isConveyorTile(cell.block?.id)) {
        changed = updateConveyor(cell, getCellAt, dt, techIds) || changed;
      }
    });

    return changed;
  }

  function forEachAmmoCell(cellsOrBoard, callback) {
    for (const item of cellsOrBoard ?? []) {
      if (Array.isArray(item)) {
        for (const cell of item) {
          callback(cell);
        }
      } else {
        callback(item);
      }
    }
  }

  function updateAmmoFactory(cell, getCellAt, dt, techIds = new Set()) {
    const block = cell.block;
    let changed = false;

    if (requiresPower(block.id) && !cell.powered) {
      return false;
    }

    const ammoFactoryInterval = getAmmoFactoryInterval(block.id, techIds);

    block.ammoProgress = (block.ammoProgress ?? 0) + dt;

    while (block.ammoProgress >= ammoFactoryInterval) {
      if (!pushAmmoForward(cell, getCellAt)) {
        block.ammoProgress = ammoFactoryInterval;
        break;
      }

      block.ammoProgress -= ammoFactoryInterval;
      changed = true;
    }

    return changed;
  }

  function updateConveyor(cell, getCellAt, dt, techIds = new Set()) {
    const block = cell.block;

    if (requiresPower(block.id) && !cell.powered) {
      return false;
    }

    if ((block.ammo ?? 0) < 1) {
      block.ammoProgress = 0;
      return false;
    }

    let changed = false;
    block.ammoProgress = (block.ammoProgress ?? 0) + dt;

    const conveyorInterval = getConveyorAmmoInterval(techIds);

    while (block.ammoProgress >= conveyorInterval && block.ammo > 0) {
      if (!pushAmmoForward(cell, getCellAt)) {
        block.ammoProgress = conveyorInterval;
        break;
      }

      block.ammo -= 1;
      block.ammoProgress -= conveyorInterval;
      changed = true;
    }

    return changed;
  }

  function pushAmmoForward(cell, getCellAt) {
    const targets = getAmmoExitCells(cell, getCellAt).filter(canAcceptAmmoTarget);

    if (targets.length === 0) {
      return false;
    }

    const target = targets[Math.floor(Math.random() * targets.length)];
    target.block.ammo = (target.block.ammo ?? 0) + 1;
    return true;
  }

  function getAmmoExitCells(cell, getCellAt) {
    const block = cell.block;
    const direction = block?.direction ?? "up";

    if (block?.id === SPLITTER_CONVEYOR_TILE_ID) {
      return getSplitterExitDirections(direction)
        .map((exitDirection) => getCellInDirection(cell, exitDirection, getCellAt))
        .filter(Boolean);
    }

    return [getCellInDirection(cell, direction, getCellAt)].filter(Boolean);
  }

  function getSplitterExitDirections(direction) {
    return [
      direction,
      rotateDirection(direction, -1),
      rotateDirection(direction, 1),
    ];
  }

  function rotateDirection(direction, offset) {
    const index = DIRECTIONS.indexOf(direction);

    if (index < 0) {
      return "up";
    }

    return DIRECTIONS[(index + offset + DIRECTIONS.length) % DIRECTIONS.length];
  }

  function getCellInDirection(cell, direction, getCellAt) {
    const vector = DIRECTION_VECTORS[direction] ?? DIRECTION_VECTORS.up;
    return getCellAt(cell.x + vector.x, cell.y + vector.y);
  }

  function canAcceptAmmoTarget(target) {
    const tileId = target?.block?.id;

    if (isConveyorTile(tileId)) {
      return (target.block.ammo ?? 0) < CONVEYOR_AMMO_CAPACITY;
    }

    if (isCannonWeapon(tileId)) {
      return (target.block.ammo ?? 0) < CANNON_AMMO_CAPACITY;
    }

    return false;
  }

  function updateRepairBots(world, board, activeEngineIds, dt) {
    if (!isPlayerShipStill(world.ship, activeEngineIds)) {
      return false;
    }

    let changed = false;

    for (const repairBot of getPoweredRepairBots(board)) {
      const target = findRepairBotTarget(board, repairBot.cell);

      if (!target) {
        repairBot.cell.block.repairEffectTimer = 0;
        continue;
      }

      const repaired = repairTile(target.tile, REPAIR_BOT_RATE * dt);

      if (!repaired) {
        continue;
      }

      changed = true;
      repairBot.cell.block.repairEffectTimer = Math.max(0, (repairBot.cell.block.repairEffectTimer ?? 0) - dt);

      if (repairBot.cell.block.repairEffectTimer <= 0) {
        spawnRepairEffect(world, repairBot.cell, target.cell);
        repairBot.cell.block.repairEffectTimer = REPAIR_EFFECT_INTERVAL;
      }
    }

    return changed;
  }

  function getPoweredRepairBots(board) {
    return getBoardBlockParts(board, REPAIR_BOT_TILE_ID).filter((part) => part.cell.powered);
  }

  function findRepairBotTarget(board, sourceCell) {
    let bestTarget = null;
    let bestRatio = Infinity;
    let bestMissingHp = -Infinity;

    for (const row of board) {
      for (const cell of row) {
        const distance = Math.hypot(cell.x - sourceCell.x, cell.y - sourceCell.y);

        if (distance > REPAIR_BOT_RADIUS_CELLS) {
          continue;
        }

        for (const tile of getRepairableTiles(cell)) {
          ensureTileHealth(tile);

          if (tile.hp <= 0 || tile.hp >= tile.maxHp) {
            continue;
          }

          const ratio = tile.maxHp > 0 ? tile.hp / tile.maxHp : 1;
          const missingHp = tile.maxHp - tile.hp;

          if (ratio < bestRatio || (ratio === bestRatio && missingHp > bestMissingHp)) {
            bestTarget = { cell, tile };
            bestRatio = ratio;
            bestMissingHp = missingHp;
          }
        }
      }
    }

    return bestTarget;
  }

  function getRepairableTiles(cell) {
    return [cell.block, cell.base, cell.underlay].filter(Boolean);
  }

  function repairTile(tile, amount) {
    ensureTileHealth(tile);

    if (!tile || tile.hp <= 0 || tile.hp >= tile.maxHp) {
      return false;
    }

    const previousHp = tile.hp;
    tile.hp = Math.min(tile.maxHp, tile.hp + amount);
    return tile.hp > previousHp;
  }

  function spawnRepairEffect(world, sourceCell, targetCell) {
    const start = localToWorld(world.ship, sourceCell.x - CORE_X, sourceCell.y - CORE_Y);
    const end = localToWorld(world.ship, targetCell.x - CORE_X, targetCell.y - CORE_Y);

    world.weaponEffects.push({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      kind: "repair-bot",
      ttl: 0.28,
    });
  }

  function isPlayerShipStill(body, activeEngineIds = new Set()) {
    return (
      activeEngineIds.size === 0 &&
      Math.hypot(body.vx, body.vy) <= REPAIR_STILL_SPEED &&
      Math.abs(body.angularVelocity) <= REPAIR_STILL_ANGULAR_SPEED
    );
  }

  function updateSalvageCollectors(world, board, inventory, dt) {
    const result = createEmptyCollection();

    for (const collector of getPoweredSalvageCollectors(board)) {
      const block = collector.cell.block;
      block.salvageCooldown = Math.max(0, (block.salvageCooldown ?? 0) - dt);

      if (block.salvageCooldown > 0) {
        continue;
      }

      const target = findSalvageCollectorTarget(world, board, collector);
      block.salvageCooldown = target ? SALVAGE_COLLECTOR_INTERVAL : Math.min(0.35, SALVAGE_COLLECTOR_INTERVAL);

      if (!target) {
        continue;
      }

      target.collected = true;
      result.collected.push(target);

      if (target.tileId === "scrap") {
        result.scrapCollected += target.scrap ?? 0;
      } else {
        inventory[target.tileId] = (inventory[target.tileId] ?? 0) + 1;
      }

      spawnSalvageCollectorEffect(world, collector, target);
      result.changed = true;
    }

    return result;
  }

  function getPoweredSalvageCollectors(board) {
    return getBoardBlockParts(board, SALVAGE_COLLECTOR_TILE_ID).filter((part) => part.cell.powered);
  }

  function findSalvageCollectorTarget(world, board, collector) {
    const start = localToWorld(world.ship, collector.localX, collector.localY);
    let bestTarget = null;
    let bestDistance = Infinity;

    for (const piece of world.pieces) {
      if (piece.collected || piece.destroyed || piece.connectedToCore) {
        continue;
      }

      const distance = Math.hypot(piece.x - start.x, piece.y - start.y);

      if (distance > SALVAGE_COLLECTOR_RANGE || distance >= bestDistance) {
        continue;
      }

      if (isSalvageLineBlocked(world, board, collector, piece, start, piece)) {
        continue;
      }

      bestTarget = piece;
      bestDistance = distance;
    }

    return bestTarget;
  }

  function isSalvageLineBlocked(world, board, collector, targetPiece, start, end) {
    for (const row of board) {
      for (const cell of row) {
        if (getBoardPartKey(cell) === collector.key || !getShotBlockingCellHitPart(cell)) {
          continue;
        }

        const center = localToWorld(world.ship, cell.x - CORE_X, cell.y - CORE_Y);
        const hit = getSegmentCircleHit(start, end, center, PART_HIT_RADIUS);

        if (hit && hit.t > 0.001) {
          return true;
        }
      }
    }

    if (getClosestEnemyShipHit(world, start, end, 0)) {
      return true;
    }

    if (getClosestTraderShipHit(world, start, end, 0)) {
      return true;
    }

    for (const piece of world.pieces) {
      if (piece === targetPiece || piece.collected || piece.destroyed || !isShotBlockingTile(piece.tileId)) {
        continue;
      }

      const hit = getSegmentCircleHit(start, end, piece, PIECE_HIT_RADIUS);

      if (hit && hit.t > 0.001) {
        return true;
      }
    }

    return false;
  }

  function spawnSalvageCollectorEffect(world, collector, piece) {
    const start = localToWorld(world.ship, collector.localX, collector.localY);

    world.weaponEffects.push({
      x1: start.x,
      y1: start.y,
      x2: piece.x,
      y2: piece.y,
      kind: "salvage-collector",
      ttl: 0.32,
    });
  }

  function updatePlayerShields(world, board, dt) {
    let changed = false;

    for (const shield of getPoweredShieldBlocks(board)) {
      changed = regenerateShieldBlock(shield.cell.block, dt) || changed;
    }

    return changed;
  }

  function getPoweredShieldBlocks(board) {
    return getBoardBlockParts(board, SHIELD_BLOCK_TILE_ID).filter((part) => {
      ensureTileHealth(part.cell.block);
      ensureShieldCharge(part.cell.block);
      return part.cell.powered && part.cell.block.hp > 0;
    });
  }

  function regenerateShieldBlock(block, dt) {
    ensureTileHealth(block);
    ensureShieldCharge(block);

    if (!block || block.hp <= 0 || block.shieldHp >= block.shieldMaxHp) {
      return false;
    }

    const previousHp = block.shieldHp;
    block.shieldHp = Math.min(block.shieldMaxHp, block.shieldHp + SHIELD_REGEN_RATE * dt);
    return block.shieldHp > previousHp;
  }

  function ensureShieldCharge(block) {
    if (!block) {
      return null;
    }

    ensureTileHealth(block);
    block.shieldMaxHp = Number.isFinite(block.shieldMaxHp) && block.shieldMaxHp > 0
      ? block.shieldMaxHp
      : block.maxHp;
    block.shieldHp = Number.isFinite(block.shieldHp)
      ? clamp(block.shieldHp, 0, block.shieldMaxHp)
      : block.shieldMaxHp;
    return block;
  }

  function getShieldCharge(block) {
    ensureShieldCharge(block);
    return Math.max(0, block?.shieldHp ?? 0);
  }

  function drainShieldCharge(block, amount) {
    ensureShieldCharge(block);

    if (!block || block.hp <= 0 || block.shieldHp <= 0) {
      return { drained: 0, depleted: true };
    }

    const drained = Math.min(block.shieldHp, Math.max(0, Number(amount) || 0));
    block.shieldHp = Math.max(0, block.shieldHp - drained);
    return {
      drained,
      depleted: block.shieldHp <= 0,
    };
  }

  function getShieldWorldRadius() {
    return SHIELD_RADIUS_CELLS * SHIP_WORLD_SCALE;
  }

  function createPiece(id, tileId, x, y, connectedToCore, health = {}) {
    const maxHp = health.maxHp ?? getTileMaxHp(tileId);

    return {
      id,
      tileId,
      x,
      y,
      hp: clamp(health.hp ?? maxHp, 0, maxHp),
      maxHp,
      connectedToCore,
      collected: false,
      destroyed: false,
    };
  }

  function createScrapPiece(id, x, y, amount) {
    return {
      id,
      tileId: "scrap",
      x,
      y,
      scrap: amount,
      connectedToCore: false,
      collected: false,
      destroyed: false,
    };
  }

  function syncPrimaryEnemy(world) {
    if (!Array.isArray(world.enemies)) {
      world.enemies = world.enemy ? [world.enemy] : [];
    }

    world.enemy = world.enemies[0] ?? createDeadEnemy();
    return world;
  }

  function createDeadEnemy() {
    return {
      id: "none",
      body: createShipBody(0, 0, 0),
      dead: true,
      aiTimer: 0,
      activeEngines: new Set(),
      cells: [],
    };
  }

  function getEnemies(world) {
    return syncPrimaryEnemy(world).enemies;
  }

  function getLiveEnemies(world) {
    return getEnemies(world).filter((enemy) => enemy && !enemy.dead);
  }

  function getTraders(world) {
    if (!Array.isArray(world.traders)) {
      const start = getOuterStartPoint();
      world.traders = createTraderShips(start.x, start.y);
    }

    if (world.traders.length > WORLD_MAX_TRADERS) {
      world.traders = world.traders.slice(0, WORLD_MAX_TRADERS);
    }

    for (const trader of world.traders) {
      hydrateTraderShape(trader);
    }

    return world.traders;
  }

  function getLiveTraders(world) {
    return getTraders(world).filter((trader) => trader && !trader.dead);
  }

  function getTraderById(world, traderId) {
    return getTraders(world).find((trader) => trader.id === traderId) ?? null;
  }

  function getNearestTraderInRange(world) {
    let nearest = null;
    let nearestDistance = Infinity;

    for (const trader of getLiveTraders(world)) {
      if (trader.hostileToPlayer) {
        continue;
      }

      const distance = Math.hypot(trader.body.x - world.ship.x, trader.body.y - world.ship.y);

      if (distance <= TRADER_TRADE_RADIUS && distance < nearestDistance) {
        nearest = {
          trader,
          distance,
        };
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  function hydrateTraderShape(trader) {
    trader.name ??= `Trader ${String(trader.id ?? "").split("-").pop() || ""}`.trim();
    trader.body ??= createShipBody(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 0);
    trader.dead = Boolean(trader.dead);
    trader.hostileToPlayer = Boolean(trader.hostileToPlayer);
    trader.aiTimer = Number(trader.aiTimer ?? 0);
    trader.wanderTimer = Number(trader.wanderTimer ?? 0);
    trader.wanderTarget = normalizePoint(trader.wanderTarget);
    trader.activeEngines = trader.activeEngines instanceof Set
      ? trader.activeEngines
      : new Set(trader.activeEngines ?? []);
    trader.cells = Array.isArray(trader.cells) && trader.cells.length > 0
      ? trader.cells
      : TRADER_SHIP_TEMPLATE.map(([x, y, baseId, blockId, direction]) => createEnemyCell(x, y, baseId, blockId, direction));
    trader.stock = Array.isArray(trader.stock) && trader.stock.length === TRADER_STOCK_SLOT_COUNT
      ? trader.stock
      : createTraderStock();
    refreshNpcPower(trader.cells);
  }

  function getEnemyById(world, enemyId) {
    return getEnemies(world).find((enemy) => enemy.id === enemyId) ?? null;
  }

  function stepWorld(world, board, activeEngineIds, inventory, deltaSeconds, remoteShips = [], options = {}) {
    syncPrimaryEnemy(world);
    const dt = Math.min(deltaSeconds, MAX_WORLD_STEP);
    const techIds = normalizeTechIds(options.techIds);
    const simulatePve = options.simulatePve ?? true;
    const collectPieces = options.collectPieces ?? true;
    const updateProjectilesEnabled = options.updateProjectiles ?? true;
    const includeWorldTargets = options.includeWorldTargets ?? simulatePve;
    const cooldownChanged = tickWeaponCooldowns(board, dt);
    const liveEnemies = simulatePve ? getLiveEnemies(world) : [];
    const liveTraders = simulatePve ? getLiveTraders(world) : [];
    const activeAnchors = getActiveWorldAnchors(world, remoteShips);
    const activeEnemies = liveEnemies.filter((enemy) => isEntityNearActiveAnchors(enemy, activeAnchors, WORLD_ACTIVE_SIM_RADIUS));
    const activeTraders = liveTraders.filter((trader) => isEntityNearActiveAnchors(trader, activeAnchors, WORLD_ACTIVE_SIM_RADIUS));
    clearInactiveNpcEngines(liveEnemies, activeEnemies);
    clearInactiveNpcEngines(liveTraders, activeTraders);
    const spawnResult = simulatePve ? updateWorldSpawns(world, dt, activeAnchors) : { spawnedPieces: 0, spawnedEnemies: 0, spawnedTraders: 0 };
    let npcPowerChanged = false;

    for (const enemy of activeEnemies) {
      npcPowerChanged = refreshNpcPower(enemy.cells) || npcPowerChanged;
    }

    for (const trader of activeTraders) {
      npcPowerChanged = refreshNpcPower(trader.cells) || npcPowerChanged;
    }

    for (const enemy of activeEnemies) {
      tickCellWeaponCooldowns(enemy.cells, dt);
    }

    for (const trader of activeTraders) {
      tickCellWeaponCooldowns(trader.cells, dt);
    }

    const ammoChanged = updateAmmoNetwork(board, dt, techIds);
    let npcAmmoChanged = false;

    for (const enemy of activeEnemies) {
      npcAmmoChanged = updateCellAmmoNetwork(enemy.cells, dt) || npcAmmoChanged;
    }

    for (const trader of activeTraders) {
      npcAmmoChanged = updateCellAmmoNetwork(trader.cells, dt) || npcAmmoChanged;
    }

    const enemyActions = activeEnemies.map((enemy) => updateEnemyAI(world, board, inventory, dt, enemy));
    const traderActions = activeTraders.map((trader) => updateTraderAI(world, board, inventory, dt, trader));

    applyEngineForces(world.ship, getBoardEngineParts(board), activeEngineIds, dt, techIds);

    for (const enemy of activeEnemies) {
      applyEngineForces(
        enemy.body,
        getCellEngineParts(enemy.cells),
        enemy.activeEngines,
        dt,
      );
    }

    for (const trader of activeTraders) {
      applyEngineForces(
        trader.body,
        getCellEngineParts(trader.cells),
        trader.activeEngines,
        dt,
      );
    }

    integrateBody(world.ship, dt, false, techIds);
    constrainBodyToWorldCircle(world.ship);

    for (const enemy of activeEnemies) {
      integrateBody(enemy.body, dt);
      constrainEnemyToZone(enemy);
    }

    for (const trader of activeTraders) {
      integrateBody(trader.body, dt);
      constrainBodyToWorldCircle(trader.body);
    }

    const repairChanged = updateRepairBots(world, board, activeEngineIds, dt);
    const salvageCollection = collectPieces ? updateSalvageCollectors(world, board, inventory, dt) : createEmptyCollection();
    const shieldChanged = updatePlayerShields(world, board, dt);
    const hits = [
      ...enemyActions.flatMap((action) => action.hits),
      ...traderActions.flatMap((action) => action.hits),
      ...(updateProjectilesEnabled
        ? updateProjectiles(world, board, inventory, dt, remoteShips, { includeWorldTargets })
        : []),
    ];
    tickWeaponEffects(world, dt);
    const collection = mergeCollections(
      collectPieces ? collectNearbyPieces(world, board, inventory) : createEmptyCollection(),
      salvageCollection,
    );
    const prunedWorld = pruneWorldState(world, activeAnchors);

    return {
      ...collection,
      hits,
      ammoChanged: ammoChanged || npcAmmoChanged || cooldownChanged || repairChanged || shieldChanged || salvageCollection.changed || npcPowerChanged,
      shipRepaired: repairChanged,
      shieldChanged,
      spawnedPieces: spawnResult.spawnedPieces,
      spawnedEnemies: spawnResult.spawnedEnemies,
      spawnedTraders: spawnResult.spawnedTraders,
      worldChanged: spawnResult.spawnedPieces > 0 || spawnResult.spawnedEnemies > 0 || spawnResult.spawnedTraders > 0 || prunedWorld || salvageCollection.changed || npcPowerChanged || npcAmmoChanged,
    };
  }

  function getActiveWorldAnchors(world, remoteShips = []) {
    const anchors = [world.ship];

    for (const remoteShip of remoteShips) {
      if (remoteShip?.body && Number.isFinite(remoteShip.body.x) && Number.isFinite(remoteShip.body.y)) {
        anchors.push(remoteShip.body);
      }
    }

    return anchors;
  }

  function isEntityNearActiveAnchors(entity, anchors, radius) {
    return isPointNearActiveAnchors(entity?.body, anchors, radius);
  }

  function isPointNearActiveAnchors(point, anchors, radius) {
    if (!point || !Array.isArray(anchors) || anchors.length === 0) {
      return false;
    }

    return anchors.some((anchor) => Math.hypot(point.x - anchor.x, point.y - anchor.y) <= radius);
  }

  function getNearestActiveAnchor(point, anchors) {
    let nearest = anchors[0] ?? null;
    let nearestDistance = Infinity;

    for (const anchor of anchors) {
      const distance = Math.hypot(point.x - anchor.x, point.y - anchor.y);

      if (distance < nearestDistance) {
        nearest = anchor;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  function clearInactiveNpcEngines(entities, activeEntities) {
    const activeSet = new Set(activeEntities);

    for (const entity of entities) {
      if (!activeSet.has(entity)) {
        entity.activeEngines = new Set();
      }
    }
  }

  function updateWorldSpawns(world, dt, activeAnchors = [world.ship]) {
    world.partSpawnTimer = Math.max(0, (world.partSpawnTimer ?? WORLD_PART_SPAWN_INTERVAL) - dt);
    world.enemySpawnTimer = Math.max(0, (world.enemySpawnTimer ?? WORLD_ENEMY_SPAWN_INTERVAL) - dt);
    world.traderSpawnTimer = Math.max(0, (world.traderSpawnTimer ?? WORLD_TRADER_SPAWN_INTERVAL) - dt);

    let spawnedPieces = 0;
    let spawnedEnemies = 0;
    let spawnedTraders = 0;

    const activeLoosePieces = world.pieces.filter((piece) => (
      !piece.collected &&
      !piece.destroyed &&
      !piece.connectedToCore &&
      isPointNearActiveAnchors(piece, activeAnchors, WORLD_LOCAL_SPAWN_RADIUS)
    )).length;

    if (world.partSpawnTimer <= 0 && activeLoosePieces < WORLD_MAX_LOOSE_PIECES) {
      const spawnCount = Math.min(4, WORLD_MAX_LOOSE_PIECES - activeLoosePieces);

      for (let index = 0; index < spawnCount; index += 1) {
        world.pieces.push(createSpawnedPiece(world, activeAnchors));
      }

      spawnedPieces = spawnCount;
      world.partSpawnTimer = WORLD_PART_SPAWN_INTERVAL;
    }

    if (world.enemySpawnTimer <= 0 && getLiveEnemies(world).length < WORLD_MAX_ENEMIES) {
      world.enemies.push(createSpawnedEnemy(world, activeAnchors));
      syncPrimaryEnemy(world);
      spawnedEnemies = 1;
      world.enemySpawnTimer = WORLD_ENEMY_SPAWN_INTERVAL;
    }

    if (world.traderSpawnTimer <= 0 && getLiveTraders(world).length < WORLD_MAX_TRADERS) {
      world.traders.push(createSpawnedTrader(world, activeAnchors));
      spawnedTraders = 1;
      world.traderSpawnTimer = WORLD_TRADER_SPAWN_INTERVAL;
    }

    return { spawnedPieces, spawnedEnemies, spawnedTraders };
  }

  function createSpawnedPiece(world, activeAnchors = [world.ship]) {
    world.spawnedPieceCount = (world.spawnedPieceCount ?? 0) + 1;
    const index = world.spawnedPieceCount;
    const tileId = LOOSE_PIECE_TILE_POOL[index % LOOSE_PIECE_TILE_POOL.length];
    const point = getDistantSpawnPoint(world, index * 1.73, 260, null, activeAnchors);

    return createPiece(`spawned-${tileId}-${index}`, tileId, point.x, point.y, false);
  }

  function createSpawnedEnemy(world, activeAnchors = [world.ship]) {
    world.spawnedEnemyCount = (world.spawnedEnemyCount ?? getEnemies(world).length) + 1;
    const index = world.spawnedEnemyCount;
    const anchor = activeAnchors[index % Math.max(1, activeAnchors.length)] ?? world.ship;
    const zone = chooseSpawnZoneForPoint(anchor, index);
    const template = chooseEnemyTemplateForZone(zone, index);
    const id = `${template.id}-${index}`;
    const point = getDistantSpawnPoint(world, index * 2.11, 900, zone, activeAnchors);
    const angle = Math.atan2(world.ship.y - point.y, world.ship.x - point.x);

    return createEnemyShip(id, point.x, point.y, angle, zone);
  }

  function createSpawnedTrader(world, activeAnchors = [world.ship]) {
    world.spawnedTraderCount = (world.spawnedTraderCount ?? getTraders(world).length) + 1;
    const index = world.spawnedTraderCount;
    const anchor = activeAnchors[index % Math.max(1, activeAnchors.length)] ?? world.ship;
    const anchorZone = getWorldZoneAtPoint(anchor);
    const traderZone = anchorZone === "core" ? "middle" : anchorZone === "middle" || index % 3 === 0 ? "middle" : "outer";
    const point = getDistantSpawnPoint(world, index * 1.41 + 0.8, 760, traderZone, activeAnchors);
    const angle = Math.atan2(WORLD_CENTER_Y - point.y, WORLD_CENTER_X - point.x);

    return createTraderShip(`trader-${index}`, point.x, point.y, angle);
  }

  function chooseSpawnZoneForPoint(point, index) {
    const playerZone = getWorldZoneAtPoint(point);

    if (playerZone === "core") {
      return index % 3 === 0 ? "middle" : "core";
    }

    if (playerZone === "middle") {
      return "middle";
    }

    return "outer";
  }

  function chooseEnemyTemplateForZone(zone, index) {
    const normalizedZone = normalizeWorldZone(zone);
    const templates = ENEMY_SHIP_TEMPLATES.filter((template) => template.zone === normalizedZone && template.id !== "boss");
    return templates[index % Math.max(1, templates.length)] ?? ENEMY_SHIP_TEMPLATES[0];
  }

  function getDistantSpawnPoint(world, seed, minimumDistance, zone = null, activeAnchors = [world.ship]) {
    const anchor = activeAnchors[Math.abs(Math.floor(seed * 997)) % Math.max(1, activeAnchors.length)] ?? world.ship;
    const spawnZone = zone ? normalizeWorldZone(zone) : getWorldZoneAtPoint(anchor);
    const maximumDistance = Math.max(minimumDistance + 200, WORLD_LOCAL_SPAWN_RADIUS);

    for (let attempt = 0; attempt < 28; attempt += 1) {
      const angle = seed + attempt * 2.399963229728653;
      const distance = minimumDistance + ((attempt * 311 + Math.floor(seed * 97)) % Math.max(1, maximumDistance - minimumDistance));
      const rawCandidate = {
        x: anchor.x + Math.cos(angle) * distance,
        y: anchor.y + Math.sin(angle) * distance,
      };
      const candidate = clampPointToZone(rawCandidate, spawnZone, 120);

      if (
        Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y) >= minimumDistance &&
        isPointNearActiveAnchors(candidate, activeAnchors, WORLD_LOCAL_SPAWN_RADIUS)
      ) {
        return candidate;
      }
    }

    return clampPointToZone({
      x: anchor.x + Math.cos(seed + Math.PI) * minimumDistance,
      y: anchor.y + Math.sin(seed + Math.PI) * minimumDistance,
    }, spawnZone, 120);
  }

  function tickWeaponCooldowns(board, dt) {
    let changed = false;

    for (const row of board) {
      for (const cell of row) {
        if (!isCoolingDown(cell.block)) {
          continue;
        }

        cell.block.cooldownRemaining = Math.max(0, cell.block.cooldownRemaining - dt);
        if (!isCoolingDown(cell.block)) {
          cell.block.cooldownRemaining = 0;
        }
        changed = true;
      }
    }

    return changed;
  }

  function tickCellWeaponCooldowns(cells, dt) {
    let changed = false;

    for (const cell of cells) {
      if (!isCoolingDown(cell.block)) {
        continue;
      }

      cell.block.cooldownRemaining = Math.max(0, cell.block.cooldownRemaining - dt);
      if (!isCoolingDown(cell.block)) {
        cell.block.cooldownRemaining = 0;
      }
      changed = true;
    }

    return changed;
  }

  function updateEnemyAI(world, board, inventory, dt, enemy) {
    enemy.aiTimer = Math.max(0, (enemy.aiTimer ?? 0) - dt);

    if (enemy.aiTimer > 0) {
      return { hits: [], changed: false };
    }

    enemy.aiTimer = ENEMY_AI_INTERVAL;

    const target = getEnemyTarget(world, enemy);

    if (!target) {
      enemy.activeEngines = new Set();
      return { hits: [], changed: true };
    }

    const angleToTarget = Math.atan2(target.y - enemy.body.y, target.x - enemy.body.x);
    const angleError = normalizeAngle(angleToTarget - enemy.body.angle);
    const distanceToTarget = Math.hypot(target.x - enemy.body.x, target.y - enemy.body.y);

    enemy.activeEngines = chooseEnemyActiveEngines(angleError, distanceToTarget);

    if (Math.abs(angleError) > ENEMY_FIRE_ARC) {
      return { hits: [], changed: true };
    }

    return fireEnemyWeapons(world, board, inventory, enemy, target);
  }

  function updateTraderAI(world, board, inventory, dt, trader) {
    trader.aiTimer = Math.max(0, (trader.aiTimer ?? 0) - dt);
    trader.wanderTimer = Math.max(0, (trader.wanderTimer ?? 0) - dt);

    if (trader.aiTimer > 0) {
      return { hits: [], changed: false };
    }

    trader.aiTimer = ENEMY_AI_INTERVAL;

    const target = getTraderTarget(world, trader);
    const navigationTarget = target ?? getTraderWanderTarget(world, trader);

    if (navigationTarget) {
      const angleToTarget = Math.atan2(navigationTarget.y - trader.body.y, navigationTarget.x - trader.body.x);
      const angleError = normalizeAngle(angleToTarget - trader.body.angle);
      const distanceToTarget = Math.hypot(navigationTarget.x - trader.body.x, navigationTarget.y - trader.body.y);
      const desiredDistance = target ? TRADER_COMBAT_DESIRED_DISTANCE : TRADER_WANDER_ARRIVAL_DISTANCE;
      trader.activeEngines = chooseTraderActiveEngines(angleError, distanceToTarget, desiredDistance);
    } else {
      trader.activeEngines = new Set();
    }

    if (!target) {
      return { hits: [], changed: true };
    }

    const angleToTarget = Math.atan2(target.y - trader.body.y, target.x - trader.body.x);
    const angleError = normalizeAngle(angleToTarget - trader.body.angle);

    if (Math.abs(angleError) > ENEMY_FIRE_ARC) {
      return { hits: [], changed: true };
    }

    return fireTraderWeapons(world, board, inventory, trader, target);
  }

  function getTraderWanderTarget(world, trader) {
    const target = normalizePoint(trader.wanderTarget);
    const distance = target ? Math.hypot(target.x - trader.body.x, target.y - trader.body.y) : 0;

    if (!target || trader.wanderTimer <= 0 || distance <= TRADER_WANDER_ARRIVAL_DISTANCE) {
      trader.wanderTarget = createTraderWanderTarget(world, trader);
      trader.wanderTimer = TRADER_WANDER_TIMER_MIN + Math.random() * (TRADER_WANDER_TIMER_MAX - TRADER_WANDER_TIMER_MIN);
    }

    return trader.wanderTarget;
  }

  function createTraderWanderTarget(world, trader) {
    const angle = Math.random() * Math.PI * 2;
    const distance = TRADER_WANDER_TARGET_DISTANCE_MIN + Math.random() * (TRADER_WANDER_TARGET_DISTANCE_MAX - TRADER_WANDER_TARGET_DISTANCE_MIN);
    const anchor = Math.random() < 0.38 ? world.ship : trader.body;

    return clampPointToWorldCircle({
      x: anchor.x + Math.cos(angle) * distance,
      y: anchor.y + Math.sin(angle) * distance,
    }, 220);
  }

  function chooseTraderActiveEngines(angleError, distanceToTarget, desiredDistance) {
    const activeEngines = new Set();

    if (angleError > 0.07) {
      activeEngines.add(ENEMY_TURN_CLOCKWISE_ENGINE);
    } else if (angleError < -0.07) {
      activeEngines.add(ENEMY_TURN_COUNTER_CLOCKWISE_ENGINE);
    }

    if (Math.abs(angleError) < ENEMY_THRUST_ARC && distanceToTarget > desiredDistance) {
      activeEngines.add(ENEMY_FORWARD_ENGINE);
    }

    return activeEngines;
  }

  function getEnemyTarget(world, enemy) {
    const targets = [
      {
        kind: "player",
        x: world.ship.x,
        y: world.ship.y,
      },
      ...getLiveEnemies(world)
        .filter((otherEnemy) => otherEnemy !== enemy && otherEnemy.id !== enemy.id)
        .map((otherEnemy) => ({
          kind: "enemy",
          enemy: otherEnemy,
          x: otherEnemy.body.x,
          y: otherEnemy.body.y,
        })),
      ...getLiveTraders(world)
        .map((trader) => ({
          kind: "trader",
          trader,
          x: trader.body.x,
          y: trader.body.y,
        })),
    ];

    let closestTarget = null;
    let closestDistance = Infinity;

    for (const target of targets) {
      if (!isTargetInsideEnemyZone(enemy, target)) {
        continue;
      }

      const distance = Math.hypot(target.x - enemy.body.x, target.y - enemy.body.y);

      if (distance > WORLD_ACTIVE_SIM_RADIUS) {
        continue;
      }

      if (distance < closestDistance) {
        closestDistance = distance;
        closestTarget = target;
      }
    }

    return closestTarget;
  }

  function isTargetInsideEnemyZone(enemy, target) {
    if (!enemy || !target) {
      return false;
    }

    return getWorldZoneAtPoint(target) === normalizeWorldZone(enemy.zone);
  }

  function getTraderTarget(world, trader) {
    const targets = [
      ...getLiveEnemies(world).map((enemy) => ({
        kind: "enemy",
        enemy,
        x: enemy.body.x,
        y: enemy.body.y,
      })),
    ];

    if (trader.hostileToPlayer) {
      targets.push({
        kind: "player",
        x: world.ship.x,
        y: world.ship.y,
      });
    }

    let closestTarget = null;
    let closestDistance = Infinity;

    for (const target of targets) {
      const distance = Math.hypot(target.x - trader.body.x, target.y - trader.body.y);

      if (distance > WORLD_ACTIVE_SIM_RADIUS) {
        continue;
      }

      if (distance < closestDistance) {
        closestDistance = distance;
        closestTarget = target;
      }
    }

    return closestTarget;
  }

  function chooseEnemyActiveEngines(angleError, distanceToPlayer) {
    const activeEngines = new Set();

    if (angleError > 0.06) {
      activeEngines.add(ENEMY_TURN_CLOCKWISE_ENGINE);
    } else if (angleError < -0.06) {
      activeEngines.add(ENEMY_TURN_COUNTER_CLOCKWISE_ENGINE);
    }

    if (Math.abs(angleError) < ENEMY_THRUST_ARC && distanceToPlayer > ENEMY_DESIRED_DISTANCE) {
      activeEngines.add(ENEMY_FORWARD_ENGINE);
    }

    return activeEngines;
  }

  function fireEnemyWeapons(world, board, inventory, enemy, target) {
    const result = {
      hits: [],
      changed: false,
    };

    for (const weapon of getEnemyWeaponParts(enemy.cells)) {
      if (isCoolingDown(weapon.cell.block)) {
        continue;
      }

      if (requiresPower(weapon.tileId) && !weapon.cell.powered) {
        continue;
      }

      const start = localToWorld(enemy.body, weapon.localX, weapon.localY);
      const range = getWeaponRange(weapon.tileId);
      const end = getExtendedAimPoint(start, target, range);
      const damage = getWeaponDamage(weapon.tileId);
      const extraRadius = isCannonWeapon(weapon.tileId) ? PROJECTILE_HIT_RADIUS : 0;

      if (isShotBlockedByCellShip(enemy.body, enemy.cells, weapon, start, end, extraRadius)) {
        continue;
      }

      if (isCannonWeapon(weapon.tileId)) {
        if ((weapon.cell.block.ammo ?? 0) < 1) {
          continue;
        }

        weapon.cell.block.ammo -= 1;
        weapon.cell.block.cooldownRemaining = getWeaponCooldown(weapon.tileId);
        spawnProjectile(world, weapon, start, target, "enemy", {
          includeWorldTargets: true,
          sourceEnemyId: enemy.id,
        });
        result.changed = true;
        continue;
      }

      const obstacleHit = raycastEnemyShotObstacle(world, board, enemy, start, end);
      const shieldHit = interceptEnemyBeamWithShield(world, board, start, end, damage);
      const hit = getClosestRayHit(obstacleHit, shieldHit);
      const laserEnd = hit?.point ?? end;

      world.weaponEffects.push({
        x1: start.x,
        y1: start.y,
        x2: laserEnd.x,
        y2: laserEnd.y,
        kind: weapon.tileId,
        ttl: 0.18,
      });

      weapon.cell.block.cooldownRemaining = getWeaponCooldown(weapon.tileId);
      result.changed = true;

      if (hit) {
        result.hits.push(hit.shieldBeamIntercepted
          ? hit
          : applyEnemyWorldHit(world, board, inventory, hit, damage));
      }
    }

    return result;
  }

  function fireTraderWeapons(world, board, inventory, trader, target) {
    const result = {
      hits: [],
      changed: false,
    };

    for (const weapon of getEnemyWeaponParts(trader.cells)) {
      if (isCoolingDown(weapon.cell.block)) {
        continue;
      }

      if (requiresPower(weapon.tileId) && !weapon.cell.powered) {
        continue;
      }

      const start = localToWorld(trader.body, weapon.localX, weapon.localY);
      const end = getExtendedAimPoint(start, target, getWeaponRange(weapon.tileId));
      const damage = getWeaponDamage(weapon.tileId);
      const extraRadius = isCannonWeapon(weapon.tileId) ? PROJECTILE_HIT_RADIUS : 0;

      if (isShotBlockedByCellShip(trader.body, trader.cells, weapon, start, end, extraRadius)) {
        continue;
      }

      if (isCannonWeapon(weapon.tileId)) {
        if ((weapon.cell.block.ammo ?? 0) < 1) {
          continue;
        }

        weapon.cell.block.ammo -= 1;
        weapon.cell.block.cooldownRemaining = getWeaponCooldown(weapon.tileId);
        spawnProjectile(world, weapon, start, target, "trader", {
          includeWorldTargets: true,
          sourceTraderId: trader.id,
        });
        result.changed = true;
        continue;
      }

      const obstacleHit = raycastTraderShotObstacle(world, board, trader, start, end);
      const shieldHit = trader.hostileToPlayer
        ? interceptEnemyBeamWithShield(world, board, start, end, damage)
        : null;
      const hit = getClosestRayHit(obstacleHit, shieldHit);
      const laserEnd = hit?.point ?? end;

      world.weaponEffects.push({
        x1: start.x,
        y1: start.y,
        x2: laserEnd.x,
        y2: laserEnd.y,
        kind: weapon.tileId,
        ttl: 0.18,
      });

      weapon.cell.block.cooldownRemaining = getWeaponCooldown(weapon.tileId);
      result.changed = true;

      if (hit) {
        result.hits.push(hit.shieldBeamIntercepted
          ? hit
          : applyTraderWorldHit(world, board, inventory, hit, damage));
      }
    }

    return result;
  }

  function applyEngineForces(body, engineParts, activeEngineIds, dt, techIds = new Set()) {
    for (const engine of engineParts) {
      if (!activeEngineIds.has(engine.key)) {
        continue;
      }

      if (engine.requiresPower && !engine.cell.powered) {
        continue;
      }

      const localForce = DIRECTION_VECTORS[engine.direction] ?? DIRECTION_VECTORS.up;
      const worldForce = rotateVector(localForce, body.angle);
      const lever = rotateVector(
        {
          x: engine.localX * SHIP_WORLD_SCALE,
          y: engine.localY * SHIP_WORLD_SCALE,
        },
        body.angle,
      );

      const engineForce = getEngineForce(engine.tileId, techIds);
      const forceX = worldForce.x * engineForce;
      const forceY = worldForce.y * engineForce;
      const torque = lever.x * forceY - lever.y * forceX;

      body.vx += forceX * dt;
      body.vy += forceY * dt;
      body.angularVelocity += torque * TORQUE_SCALE * dt;
    }
  }

  function integrateBody(body, dt, wraps = false, techIds = new Set()) {
    const frameScale = dt * 60;
    const linearDamping = getLinearDamping(techIds);
    const angularDamping = getAngularDamping(techIds);

    body.x += body.vx * dt;
    body.y += body.vy * dt;

    if (wraps) {
      wrapBodyPosition(body);
    } else {
      body.x = clamp(body.x, 45, WORLD_WIDTH - 45);
      body.y = clamp(body.y, 45, WORLD_HEIGHT - 45);
    }

    body.angle = normalizeAngle(body.angle + body.angularVelocity * dt);
    body.vx *= Math.pow(linearDamping, frameScale);
    body.vy *= Math.pow(linearDamping, frameScale);
    body.angularVelocity *= Math.pow(angularDamping, frameScale);
  }

  function wrapBodyPosition(body) {
    if (body.x < 45) {
      body.x = WORLD_WIDTH - 45;
    } else if (body.x > WORLD_WIDTH - 45) {
      body.x = 45;
    }

    if (body.y < 45) {
      body.y = WORLD_HEIGHT - 45;
    } else if (body.y > WORLD_HEIGHT - 45) {
      body.y = 45;
    }
  }

  function constrainBodyToWorldCircle(body, margin = 45) {
    constrainBodyToAnnulus(body, 0, Math.max(80, WORLD_RADIUS - margin));
  }

  function constrainEnemyToZone(enemy) {
    const bounds = getZoneBounds(enemy.zone);
    const margin = enemy.zone === "core" ? 70 : 55;
    constrainBodyToAnnulus(
      enemy.body,
      Math.max(0, bounds.min + (bounds.min > 0 ? margin : 0)),
      Math.max(90, bounds.max - margin),
    );
  }

  function constrainBodyToAnnulus(body, minRadius, maxRadius) {
    if (!body) {
      return;
    }

    const radial = getRadialState(body);
    let distance = radial.distance;
    let nx = radial.nx;
    let ny = radial.ny;

    if (distance > maxRadius) {
      body.x = WORLD_CENTER_X + nx * maxRadius;
      body.y = WORLD_CENTER_Y + ny * maxRadius;
      dampRadialVelocity(body, nx, ny, 1);
      return;
    }

    if (distance < minRadius) {
      if (distance < 0.001) {
        nx = Math.cos(body.angle || 0);
        ny = Math.sin(body.angle || 0);
      }

      body.x = WORLD_CENTER_X + nx * minRadius;
      body.y = WORLD_CENTER_Y + ny * minRadius;
      dampRadialVelocity(body, -nx, -ny, 1);
    }
  }

  function getRadialState(point) {
    const dx = point.x - WORLD_CENTER_X;
    const dy = point.y - WORLD_CENTER_Y;
    const distance = Math.hypot(dx, dy);

    if (distance <= 0.001) {
      return {
        distance,
        nx: 1,
        ny: 0,
      };
    }

    return {
      distance,
      nx: dx / distance,
      ny: dy / distance,
    };
  }

  function dampRadialVelocity(body, nx, ny, strength = 1) {
    const radialSpeed = body.vx * nx + body.vy * ny;

    if (radialSpeed <= 0) {
      return;
    }

    body.vx -= nx * radialSpeed * strength;
    body.vy -= ny * radialSpeed * strength;
  }

  function fireWeapons(world, board, selectedWeaponIds, target, inventory, remoteShips = [], options = {}) {
    const weapons = getBoardWeaponParts(board).filter((weapon) => selectedWeaponIds.has(weapon.key));
    const includeWorldTargets = options.includeWorldTargets ?? true;
    const techIds = normalizeTechIds(options.techIds);
    const result = {
      collected: [],
      scrapCollected: 0,
      blocked: 0,
      destroyedCore: false,
      fired: 0,
      hits: [],
      coolingDown: 0,
      noAmmo: 0,
      noPower: 0,
      released: 0,
    };

    if (!weapons.length) {
      return result;
    }

    for (const weapon of weapons) {
      const start = localToWorld(world.ship, weapon.localX, weapon.localY);

      if (isCoolingDown(weapon.cell.block)) {
        result.coolingDown += 1;
        continue;
      }

      if (requiresPower(weapon.tileId) && !weapon.cell.powered) {
        result.noPower += 1;
        continue;
      }

      if (isCannonWeapon(weapon.tileId)) {
        const cannonEnd = getExtendedAimPoint(start, target, getWeaponRange(weapon.tileId, techIds));

        if (isShotBlockedByOwnShip(world, board, weapon, start, cannonEnd, PROJECTILE_HIT_RADIUS)) {
          result.blocked += 1;
          continue;
        }

        if ((weapon.cell.block.ammo ?? 0) < 1) {
          result.noAmmo += 1;
          continue;
        }

        weapon.cell.block.ammo -= 1;
        weapon.cell.block.cooldownRemaining = getWeaponCooldown(weapon.tileId, techIds);
        spawnProjectile(world, weapon, start, target, "player", { includeWorldTargets, techIds });
        result.fired += 1;
        continue;
      }

      const laserEnd = getExtendedAimPoint(start, target, getWeaponRange(weapon.tileId, techIds));

      if (isShotBlockedByOwnShip(world, board, weapon, start, laserEnd)) {
        result.blocked += 1;
        continue;
      }

      const hit = raycastFirstObstacle(world, start, laserEnd, 0, remoteShips, { includeWorldTargets });
      const end = hit?.point ?? laserEnd;

      world.weaponEffects.push({
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        kind: weapon.tileId,
        ttl: 0.18,
      });

      result.fired += 1;
      weapon.cell.block.cooldownRemaining = getWeaponCooldown(weapon.tileId, techIds);

      if (hit) {
        const hitResult = applyWorldHit(world, board, inventory, hit, getWeaponDamage(weapon.tileId, techIds));
        result.hits.push(hitResult);
        result.destroyedCore ||= hitResult.destroyedCore;
        result.released += hitResult.released;
        result.collected.push(...hitResult.collected);
        result.scrapCollected += hitResult.scrapCollected ?? 0;
      }
    }

    return result;
  }

  function spawnProjectile(world, weapon, start, target, faction = "player", options = {}) {
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const distance = Math.hypot(dx, dy) || 1;
    const techIds = normalizeTechIds(options.techIds);
    const projectileSpeed = getCannonProjectileSpeed(weapon.tileId, techIds);

    world.projectiles.push({
      id: `projectile-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      x: start.x,
      y: start.y,
      previousX: start.x,
      previousY: start.y,
      vx: (dx / distance) * projectileSpeed,
      vy: (dy / distance) * projectileSpeed,
      ttl: getCannonProjectileTtl(weapon.tileId, techIds),
      tileId: weapon.tileId,
      damage: getWeaponDamage(weapon.tileId, techIds),
      faction,
      sourceEnemyId: options.sourceEnemyId ?? null,
      sourceTraderId: options.sourceTraderId ?? null,
      includeWorldTargets: options.includeWorldTargets ?? faction !== "enemy",
    });

    if (world.projectiles.length > MAX_WORLD_PROJECTILES) {
      world.projectiles = world.projectiles.slice(-MAX_WORLD_PROJECTILES);
    }
  }

  function getExtendedAimPoint(start, target, range) {
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const distance = Math.hypot(dx, dy);

    if (distance === 0) {
      return {
        x: start.x + range,
        y: start.y,
      };
    }

    return {
      x: start.x + (dx / distance) * range,
      y: start.y + (dy / distance) * range,
    };
  }

  function destroyEnemyCore(world, board, inventory, enemy = world.enemy) {
    if (!enemy || enemy.dead) {
      return { collected: [], released: 0 };
    }

    let released = 0;
    enemy.dead = true;
    enemy.activeEngines = new Set();

    for (const cell of enemy.cells) {
      if (cell.base?.id === "ship-scaffold") {
        releaseCellPiece(world, enemy, cell, cell.base, "base");
        released += 1;
      }

      if (cell.underlay?.id) {
        releaseCellPiece(world, enemy, cell, cell.underlay, "underlay");
        released += 1;
      }

      if (cell.block?.id && cell.block.id !== "electric-cable") {
        releaseCellPiece(world, enemy, cell, cell.block, "block");
        released += 1;
      }
    }

    releaseEnemyScrap(world, enemy);

    const collection = collectNearbyPieces(world, board, inventory);
    return { ...collection, released };
  }

  function releaseEnemyScrap(world, enemy) {
    const scrapTotal = ENEMY_SCRAP_DROP_MIN + Math.floor(Math.random() * (ENEMY_SCRAP_DROP_MAX - ENEMY_SCRAP_DROP_MIN + 1));
    const dropCount = 4;
    let remaining = scrapTotal;

    for (let index = 0; index < dropCount; index += 1) {
      const amount = index === dropCount - 1
        ? remaining
        : Math.max(8, Math.floor(scrapTotal / dropCount + Math.random() * 10 - 5));
      remaining -= amount;
      const angle = enemy.body.angle + index * ((Math.PI * 2) / dropCount);
      const distance = 26 + index * 7;
      const point = clampPointToWorldCircle({
        x: enemy.body.x + Math.cos(angle) * distance,
        y: enemy.body.y + Math.sin(angle) * distance,
      }, 25);

      world.pieces.push(createScrapPiece(
        `${enemy.id}-scrap-${index + 1}`,
        point.x,
        point.y,
        amount,
      ));
    }
  }

  function updateProjectiles(world, board, inventory, dt, remoteShips = [], options = {}) {
    const hits = [];
    const includeWorldTargets = options.includeWorldTargets ?? true;

    for (const projectile of world.projectiles) {
      projectile.previousX = projectile.x;
      projectile.previousY = projectile.y;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.ttl -= dt;

      const start = { x: projectile.previousX, y: projectile.previousY };
      const end = { x: projectile.x, y: projectile.y };
      const shieldHit = shouldPlayerShieldInterceptProjectile(world, projectile)
        ? interceptEnemyProjectileWithShield(world, board, projectile, start, end)
        : null;

      if (shieldHit) {
        projectile.ttl = 0;
        hits.push(shieldHit);
        continue;
      }

      const hit = getProjectileHit(world, board, projectile, start, end, remoteShips, includeWorldTargets);

      if (hit) {
        projectile.ttl = 0;
        hits.push(applyProjectileHit(world, board, inventory, hit, projectile));
      }
    }

    world.projectiles = world.projectiles.filter((projectile) => {
      if (projectile.ttl <= 0) {
        return false;
      }

      return isPointInsideWorldCircle(projectile, 120);
    });

    return hits;
  }

  function shouldPlayerShieldInterceptProjectile(world, projectile) {
    if (projectile.faction === "enemy") {
      return true;
    }

    if (projectile.faction !== "trader") {
      return false;
    }

    return Boolean(getTraderById(world, projectile.sourceTraderId)?.hostileToPlayer);
  }

  function getProjectileHit(world, board, projectile, start, end, remoteShips, includeWorldTargets) {
    if (projectile.faction === "enemy") {
      return raycastEnemyShotObstacle(
        world,
        board,
        getEnemyById(world, projectile.sourceEnemyId),
        start,
        end,
        PROJECTILE_HIT_RADIUS,
      );
    }

    if (projectile.faction === "trader") {
      return raycastTraderShotObstacle(
        world,
        board,
        getTraderById(world, projectile.sourceTraderId),
        start,
        end,
        PROJECTILE_HIT_RADIUS,
      );
    }

    return raycastFirstObstacle(
      world,
      start,
      end,
      PROJECTILE_HIT_RADIUS,
      remoteShips,
      { includeWorldTargets: projectile.includeWorldTargets ?? includeWorldTargets },
    );
  }

  function applyProjectileHit(world, board, inventory, hit, projectile) {
    if (projectile.faction === "enemy") {
      return applyEnemyWorldHit(world, board, inventory, hit, projectile.damage);
    }

    if (projectile.faction === "trader") {
      return applyTraderWorldHit(world, board, inventory, hit, projectile.damage);
    }

    return applyWorldHit(world, board, inventory, hit, projectile.damage);
  }

  function interceptEnemyProjectileWithShield(world, board, projectile, start, end) {
    let closestShieldHit = null;
    const shieldRadius = getShieldWorldRadius() + PROJECTILE_HIT_RADIUS;

    for (const shield of getPoweredShieldBlocks(board)) {
      if (getShieldCharge(shield.cell.block) <= 0) {
        continue;
      }

      const center = localToWorld(world.ship, shield.localX, shield.localY);
      const hit = getSegmentCircleEntryHit(start, end, center, shieldRadius);

      if (!hit || (closestShieldHit && hit.t >= closestShieldHit.t)) {
        continue;
      }

      closestShieldHit = {
        ...hit,
        shield,
        center,
        point: {
          x: start.x + (end.x - start.x) * hit.t,
          y: start.y + (end.y - start.y) * hit.t,
        },
      };
    }

    if (!closestShieldHit) {
      return null;
    }

    return absorbProjectileWithShield(world, closestShieldHit, projectile);
  }

  function absorbProjectileWithShield(world, shieldHit, projectile) {
    const shield = shieldHit.shield;
    const absorbedDamage = Math.max(0, Number(projectile.damage) || 0);
    const shieldDamage = Math.max(1, Math.ceil(absorbedDamage * SHIELD_PROJECTILE_DAMAGE_RATIO));
    const shieldDrain = drainShieldCharge(shield.cell.block, shieldDamage);
    const shieldDestroyed = shieldDrain.depleted;

    world.weaponEffects.push({
      x1: shieldHit.center.x,
      y1: shieldHit.center.y,
      x2: shieldHit.point.x,
      y2: shieldHit.point.y,
      kind: "shield-impact",
      ttl: 0.24,
    });

    return {
      collected: [],
      scrapCollected: 0,
      damage: 0,
      shieldAbsorbed: absorbedDamage,
      shieldDamage: shieldDrain.drained,
      shieldDestroyed,
      shieldProjectileIntercepted: true,
      destroyedPart: false,
      destroyedCore: false,
      destroyedPlayerCore: false,
      partName: "Your Shield Block",
      released: 0,
    };
  }

  function interceptEnemyBeamWithShield(world, board, start, end, damage) {
    let closestShieldHit = null;
    const shieldRadius = getShieldWorldRadius();

    for (const shield of getPoweredShieldBlocks(board)) {
      if (getShieldCharge(shield.cell.block) <= 0) {
        continue;
      }

      const center = localToWorld(world.ship, shield.localX, shield.localY);
      const hit = getSegmentCircleEntryHit(start, end, center, shieldRadius);

      if (!hit || (closestShieldHit && hit.t >= closestShieldHit.t)) {
        continue;
      }

      closestShieldHit = {
        ...hit,
        shield,
        center,
        point: {
          x: start.x + (end.x - start.x) * hit.t,
          y: start.y + (end.y - start.y) * hit.t,
        },
      };
    }

    if (!closestShieldHit) {
      return null;
    }

    return absorbBeamWithShield(world, closestShieldHit, damage);
  }

  function absorbBeamWithShield(world, shieldHit, damage) {
    const absorbedDamage = Math.max(0, Number(damage) || 0);
    const shieldDamage = Math.max(1, Math.ceil(absorbedDamage * SHIELD_PROJECTILE_DAMAGE_RATIO));
    const shieldDrain = drainShieldCharge(shieldHit.shield.cell.block, shieldDamage);

    world.weaponEffects.push({
      x1: shieldHit.center.x,
      y1: shieldHit.center.y,
      x2: shieldHit.point.x,
      y2: shieldHit.point.y,
      kind: "shield-impact",
      ttl: 0.24,
    });

    return {
      t: shieldHit.t,
      point: shieldHit.point,
      kind: "shield",
      collected: [],
      scrapCollected: 0,
      damage: 0,
      shieldAbsorbed: absorbedDamage,
      shieldDamage: shieldDrain.drained,
      shieldDestroyed: shieldDrain.depleted,
      shieldBeamIntercepted: true,
      destroyedPart: false,
      destroyedCore: false,
      destroyedPlayerCore: false,
      partName: "Your Shield Block",
      released: 0,
    };
  }

  function getClosestRayHit(...hits) {
    return hits.reduce((closest, hit) => {
      if (!hit) {
        return closest;
      }

      if (!closest || hit.t < closest.t) {
        return hit;
      }

      return closest;
    }, null);
  }

  function raycastFirstObstacle(world, start, end, extraRadius = 0, remoteShips = [], options = {}) {
    let closestHit = null;
    const includeWorldTargets = options.includeWorldTargets ?? true;

    if (includeWorldTargets) {
      closestHit = getClosestEnemyShipHit(world, start, end, extraRadius, closestHit);
      closestHit = getClosestTraderShipHit(world, start, end, extraRadius, closestHit);
    }

    for (const remoteShip of remoteShips) {
      if (!remoteShip?.body || !remoteShip?.board) {
        continue;
      }

      for (const row of remoteShip.board) {
        for (const cell of row) {
          const part = getShotBlockingCellHitPart(cell);

          if (!part) {
            continue;
          }

          const center = localToWorld(remoteShip.body, cell.x - CORE_X, cell.y - CORE_Y);
          const hit = getSegmentCircleHit(start, end, center, PART_HIT_RADIUS + extraRadius);

          if (hit && (!closestHit || hit.t < closestHit.t)) {
            closestHit = createRayHit(start, end, hit, {
              kind: "remote-player",
              remotePlayerId: remoteShip.id,
              remoteCellKey: getBoardPartKey(cell),
              cell,
              part,
            });
          }
        }
      }
    }

    if (includeWorldTargets) {
      closestHit = getClosestPieceHit(world, start, end, extraRadius, closestHit);
    }

    return closestHit;
  }

  function raycastEnemyShotObstacle(world, board, sourceEnemy, start, end, extraRadius = 0) {
    let closestHit = raycastPlayerObstacle(world, board, start, end, extraRadius, { includePieces: false });
    closestHit = getClosestEnemyShipHit(world, start, end, extraRadius, closestHit, sourceEnemy?.id ?? null);
    closestHit = getClosestTraderShipHit(world, start, end, extraRadius, closestHit);
    closestHit = getClosestPieceHit(world, start, end, extraRadius, closestHit);
    return closestHit;
  }

  function raycastTraderShotObstacle(world, board, sourceTrader, start, end, extraRadius = 0) {
    let closestHit = null;

    if (sourceTrader?.hostileToPlayer) {
      closestHit = raycastPlayerObstacle(world, board, start, end, extraRadius, { includePieces: false });
    }

    closestHit = getClosestEnemyShipHit(world, start, end, extraRadius, closestHit);
    closestHit = getClosestPieceHit(world, start, end, extraRadius, closestHit);
    return closestHit;
  }

  function getClosestEnemyShipHit(world, start, end, extraRadius = 0, closestHit = null, excludedEnemyId = null) {
    for (const enemy of getLiveEnemies(world)) {
      if (enemy.id === excludedEnemyId) {
        continue;
      }

      for (const cell of enemy.cells) {
        const part = getShotBlockingCellHitPart(cell);

        if (!part) {
          continue;
        }

        const center = localToWorld(enemy.body, cell.x, cell.y);
        const hit = getSegmentCircleHit(start, end, center, PART_HIT_RADIUS + extraRadius);

        if (hit && (!closestHit || hit.t < closestHit.t)) {
          closestHit = createRayHit(start, end, hit, {
            kind: "enemy",
            enemy,
            cell,
            part,
          });
        }
      }
    }

    return closestHit;
  }

  function getClosestTraderShipHit(world, start, end, extraRadius = 0, closestHit = null, excludedTraderId = null) {
    for (const trader of getLiveTraders(world)) {
      if (trader.id === excludedTraderId) {
        continue;
      }

      for (const cell of trader.cells) {
        const part = getShotBlockingCellHitPart(cell);

        if (!part) {
          continue;
        }

        const center = localToWorld(trader.body, cell.x, cell.y);
        const hit = getSegmentCircleHit(start, end, center, PART_HIT_RADIUS + extraRadius);

        if (hit && (!closestHit || hit.t < closestHit.t)) {
          closestHit = createRayHit(start, end, hit, {
            kind: "trader",
            trader,
            cell,
            part,
          });
        }
      }
    }

    return closestHit;
  }

  function getClosestPieceHit(world, start, end, extraRadius = 0, closestHit = null) {
    for (const piece of world.pieces) {
      if (piece.collected || piece.destroyed || !isShotBlockingTile(piece.tileId)) {
        continue;
      }

      const hit = getSegmentCircleHit(start, end, piece, PIECE_HIT_RADIUS + extraRadius);

      if (hit && (!closestHit || hit.t < closestHit.t)) {
        closestHit = createRayHit(start, end, hit, {
          kind: "piece",
          piece,
          part: {
            id: piece.tileId,
            layer: "piece",
            name: `Loose ${formatTileName(piece.tileId)}`,
          },
        });
      }
    }

    return closestHit;
  }

  function raycastPlayerObstacle(world, board, start, end, extraRadius = 0, options = {}) {
    let closestHit = null;
    const includePieces = options.includePieces ?? true;

    for (const row of board) {
      for (const cell of row) {
        const part = getShotBlockingCellHitPart(cell);

        if (!part) {
          continue;
        }

        const center = localToWorld(world.ship, cell.x - CORE_X, cell.y - CORE_Y);
        const hit = getSegmentCircleHit(start, end, center, PART_HIT_RADIUS + extraRadius);

        if (hit && (!closestHit || hit.t < closestHit.t)) {
          closestHit = createRayHit(start, end, hit, {
            kind: "player",
            cell,
            part,
          });
        }
      }
    }

    if (includePieces) {
      closestHit = getClosestPieceHit(world, start, end, extraRadius, closestHit);
    }

    return closestHit;
  }

  function isShotBlockedByOwnShip(world, board, weapon, start, end, extraRadius = 0) {
    for (const row of board) {
      for (const cell of row) {
        if (getBoardPartKey(cell) === weapon.key || !getShotBlockingCellHitPart(cell)) {
          continue;
        }

        const center = localToWorld(world.ship, cell.x - CORE_X, cell.y - CORE_Y);
        const hit = getSegmentCircleHit(start, end, center, PART_HIT_RADIUS + extraRadius);

        if (hit && hit.t > 0.001) {
          return true;
        }
      }
    }

    return false;
  }

  function isShotBlockedByCellShip(body, cells, weapon, start, end, extraRadius = 0) {
    for (const cell of cells) {
      if (getLocalPartKey(cell) === weapon.key || !getShotBlockingCellHitPart(cell)) {
        continue;
      }

      const center = localToWorld(body, cell.x, cell.y);
      const hit = getSegmentCircleHit(start, end, center, PART_HIT_RADIUS + extraRadius);

      if (hit && hit.t > 0.001) {
        return true;
      }
    }

    return false;
  }

  function getShotBlockingCellHitPart(cell) {
    const part = getCellHitPart(cell);
    return part && isShotBlockingTile(part.id) ? part : null;
  }

  function isShotBlockingTile(tileId) {
    return tileId !== "ship-scaffold" && tileId !== "electric-cable" && tileId !== "scrap";
  }

  function createRayHit(start, end, hit, details) {
    return {
      ...hit,
      ...details,
      point: {
        x: start.x + (end.x - start.x) * hit.t,
        y: start.y + (end.y - start.y) * hit.t,
      },
    };
  }

  function getSegmentCircleEntryHit(start, end, center, radius) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fx = start.x - center.x;
    const fy = start.y - center.y;
    const a = dx * dx + dy * dy;

    if (a === 0) {
      return null;
    }

    const c = fx * fx + fy * fy - radius * radius;

    if (c <= 0) {
      return { distance: 0, t: 0 };
    }

    const b = 2 * (fx * dx + fy * dy);
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
      return null;
    }

    const root = Math.sqrt(discriminant);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    const t = [t1, t2].find((candidate) => candidate >= 0 && candidate <= 1);

    if (t === undefined) {
      return null;
    }

    return { distance: 0, t };
  }

  function getSegmentCircleHit(start, end, center, radius) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return null;
    }

    const t = clamp(((center.x - start.x) * dx + (center.y - start.y) * dy) / lengthSquared, 0, 1);
    const closestX = start.x + dx * t;
    const closestY = start.y + dy * t;
    const distance = Math.hypot(center.x - closestX, center.y - closestY);

    if (distance > radius) {
      return null;
    }

    return { distance, t };
  }

  function getCellHitPart(cell) {
    if (cell.base?.id === "core") {
      return createHitPart(cell.base, "base", "Core");
    }

    if (cell.block?.id) {
      return createHitPart(cell.block, "block", formatTileName(cell.block.id));
    }

    if (cell.base?.id === "ship-scaffold") {
      return createHitPart(cell.base, "base", "Ship Scaffold");
    }

    if (cell.underlay?.id) {
      return createHitPart(cell.underlay, "underlay", "Electric Cable");
    }

    return null;
  }

  function createHitPart(tile, layer, name) {
    ensureTileHealth(tile);

    if (tile.hp <= 0) {
      return null;
    }

    return {
      id: tile.id,
      layer,
      name,
      tile,
    };
  }

  function applyWorldHit(world, board, inventory, hit, damage) {
    if (hit.kind === "piece") {
      return damagePieceHit(hit.piece, damage);
    }

    if (hit.kind === "trader") {
      return applyTraderHit(world, board, inventory, hit, damage, "player");
    }

    if (hit.kind === "remote-player") {
      return createRemotePlayerHit(hit, damage);
    }

    return applyEnemyHit(world, board, inventory, hit, damage);
  }

  function applyEnemyWorldHit(world, board, inventory, hit, damage) {
    if (hit.kind === "piece") {
      return damagePieceHit(hit.piece, damage);
    }

    if (hit.kind === "enemy") {
      return applyEnemyHit(world, board, inventory, hit, damage);
    }

    if (hit.kind === "trader") {
      return applyTraderHit(world, board, inventory, hit, damage, "enemy");
    }

    return applyPlayerHit(world, board, hit, damage);
  }

  function applyTraderWorldHit(world, board, inventory, hit, damage) {
    if (hit.kind === "piece") {
      return damagePieceHit(hit.piece, damage);
    }

    if (hit.kind === "enemy") {
      return applyEnemyHit(world, board, inventory, hit, damage);
    }

    if (hit.kind === "player") {
      return applyPlayerHit(world, board, hit, damage);
    }

    return {
      collected: [],
      scrapCollected: 0,
      damage,
      destroyedPart: false,
      destroyedCore: false,
      partName: "Trader ship",
      released: 0,
    };
  }

  function applyEnemyHit(world, board, inventory, hit, damage) {
    const result = {
      collected: [],
      scrapCollected: 0,
      damage,
      destroyedPart: false,
      destroyedCore: false,
      partName: hit.part.name,
      released: 0,
    };

    if (hit.part.id === "core") {
      if (damageTile(hit.part.tile, damage)) {
        const coreResult = destroyEnemyCore(world, board, inventory, hit.enemy ?? world.enemy);
        return {
          ...result,
          ...coreResult,
          destroyedCore: true,
          destroyedPart: true,
          partName: "Core",
        };
      }

      return result;
    }

    if (damageTile(hit.part.tile, damage)) {
      destroyEnemyPart(world, hit.enemy ?? world.enemy, hit.cell, hit.part.layer);
      result.destroyedPart = true;
    }

    return result;
  }

  function applyTraderHit(world, board, inventory, hit, damage, attacker = "enemy") {
    const wasHostile = Boolean(hit.trader?.hostileToPlayer);
    const result = {
      collected: [],
      scrapCollected: 0,
      damage,
      destroyedPart: false,
      destroyedCore: false,
      partName: hit.part.id === "core" ? `${hit.trader?.name ?? "Trader"} Core` : `${hit.trader?.name ?? "Trader"} ${hit.part.name}`,
      released: 0,
      traderId: hit.trader?.id ?? null,
      traderName: hit.trader?.name ?? "Trader",
      traderHostile: false,
    };

    if (attacker === "player" && hit.trader && !hit.trader.dead) {
      hit.trader.hostileToPlayer = true;
      result.traderHostile = !wasHostile;
    }

    if (hit.part.id === "core") {
      if (damageTile(hit.part.tile, damage)) {
        const coreResult = destroyEnemyCore(world, board, inventory, hit.trader);
        return {
          ...result,
          ...coreResult,
          destroyedCore: true,
          destroyedPart: true,
          partName: `${hit.trader?.name ?? "Trader"} Core`,
        };
      }

      return result;
    }

    if (damageTile(hit.part.tile, damage)) {
      destroyEnemyPart(world, hit.trader, hit.cell, hit.part.layer);
      result.destroyedPart = true;
    }

    return result;
  }

  function absorbDamageWithNearbyShield(board, targetCell, damage) {
    const incomingDamage = Math.max(0, Number(damage) || 0);

    if (!targetCell || incomingDamage <= 0) {
      return {
        damage: incomingDamage,
        absorbed: 0,
        shieldDestroyed: false,
      };
    }

    const shield = findNearbyPoweredShield(board, targetCell);

    if (!shield) {
      return {
        damage: incomingDamage,
        absorbed: 0,
        shieldDestroyed: false,
      };
    }

    const requestedAbsorb = Math.min(incomingDamage, Math.ceil(incomingDamage * SHIELD_ABSORB_RATIO));
    const shieldDrain = drainShieldCharge(shield.cell.block, requestedAbsorb);
    const absorbed = shieldDrain.drained;
    const shieldDestroyed = shieldDrain.depleted;

    return {
      damage: Math.max(0, incomingDamage - absorbed),
      absorbed,
      shieldDestroyed,
    };
  }

  function findNearbyPoweredShield(board, targetCell) {
    let nearest = null;
    let nearestDistance = Infinity;

    for (const shield of getPoweredShieldBlocks(board)) {
      const cell = shield.cell;

      if (cell === targetCell) {
        continue;
      }

      if (getShieldCharge(cell.block) <= 0) {
        continue;
      }

      const distance = Math.hypot(cell.x - targetCell.x, cell.y - targetCell.y);

      if (distance <= SHIELD_RADIUS_CELLS && distance < nearestDistance) {
        nearest = { cell, distance };
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  function applyPlayerHit(world, board, hit, damage) {
    const shieldResult = absorbDamageWithNearbyShield(board, hit.cell, damage);
    const finalDamage = shieldResult.damage;
    const result = {
      collected: [],
      scrapCollected: 0,
      damage: finalDamage,
      shieldAbsorbed: shieldResult.absorbed,
      shieldDestroyed: shieldResult.shieldDestroyed,
      destroyedPart: false,
      destroyedCore: false,
      destroyedPlayerCore: false,
      partName: hit.part.id === "core" ? "Your Core" : `Your ${hit.part.name}`,
      released: 0,
    };

    if (finalDamage <= 0) {
      return result;
    }

    if (hit.part.id === "core") {
      if (damageTile(hit.part.tile, finalDamage)) {
        world.playerCoreDestroyed = true;
        result.destroyedCore = true;
        result.destroyedPlayerCore = true;
        result.destroyedPart = true;
      }

      return result;
    }

    if (damageTile(hit.part.tile, finalDamage)) {
      destroyPlayerPart(hit.cell, hit.part.layer);
      result.destroyedPart = true;
    }

    return result;
  }

  function damagePieceHit(piece, damage) {
    ensurePieceHealth(piece);
    piece.hp = Math.max(0, piece.hp - damage);

    if (piece.hp <= 0) {
      piece.destroyed = true;
    }

    return {
      collected: [],
      scrapCollected: 0,
      damage,
      destroyedPart: piece.destroyed,
      destroyedCore: false,
      partName: `Loose ${formatTileName(piece.tileId)}`,
      released: 0,
    };
  }

  function createRemotePlayerHit(hit, damage) {
    return {
      collected: [],
      scrapCollected: 0,
      damage,
      destroyedPart: false,
      destroyedCore: false,
      partName: `Player ${hit.remotePlayerId} ${hit.part.name}`,
      released: 0,
      remotePlayerId: hit.remotePlayerId,
      remoteCellKey: hit.remoteCellKey,
      remoteLayer: hit.part.layer,
    };
  }

  function destroyEnemyPart(world, enemy, cell, layer) {
    if (layer === "block") {
      cell.block = null;
    } else if (layer === "base") {
      cell.base = null;
      cell.block = null;
      cell.underlay = null;
    } else if (layer === "underlay") {
      cell.underlay = null;
    }

    enemy.cells = enemy.cells.filter((enemyCell) => (
      enemyCell.base || enemyCell.block || enemyCell.underlay
    ));
  }

  function destroyPlayerPart(cell, layer) {
    if (layer === "block") {
      cell.block = null;
    } else if (layer === "base") {
      cell.base = null;
      cell.block = null;
      cell.underlay = null;
    } else if (layer === "underlay") {
      cell.underlay = null;
    }
  }

  function releaseCellPiece(world, enemy, cell, tile, layer) {
    const point = clampPointToWorldCircle(localToWorld(enemy.body, cell.x, cell.y), 30);
    ensureTileHealth(tile);
    world.pieces.push(createPiece(
      `${enemy.id}-${layer}-${cell.x},${cell.y}-${tile.id}`,
      tile.id,
      point.x,
      point.y,
      false,
      {
        hp: tile.hp,
        maxHp: tile.maxHp,
      },
    ));
  }

  function collectNearbyPieces(world, board, inventory) {
    const collected = collectPiecesNearShip(world, board, world.ship);
    let scrapCollected = 0;

    for (const piece of collected) {
      if (piece.tileId === "scrap") {
        scrapCollected += piece.scrap ?? 0;
        continue;
      }

      inventory[piece.tileId] = (inventory[piece.tileId] ?? 0) + 1;
    }

    return { collected, scrapCollected };
  }

  function collectNearbyPiecesForShip(world, board, body) {
    const collected = collectPiecesNearShip(world, board, body);
    const scrapCollected = collected.reduce((total, piece) => (
      total + (piece.tileId === "scrap" ? piece.scrap ?? 0 : 0)
    ), 0);

    return { collected, scrapCollected };
  }

  function createEmptyCollection() {
    return {
      collected: [],
      scrapCollected: 0,
      changed: false,
    };
  }

  function mergeCollections(...collections) {
    return collections.reduce((merged, collection) => {
      merged.collected.push(...(collection?.collected ?? []));
      merged.scrapCollected += collection?.scrapCollected ?? 0;
      merged.changed ||= Boolean(collection?.changed);
      return merged;
    }, createEmptyCollection());
  }

  function collectPiecesNearShip(world, board, body) {
    const sources = getScaffoldWorldPoints(board, body);
    const collected = [];

    if (!sources.length) {
      return collected;
    }

    for (const piece of world.pieces) {
      if (piece.collected || piece.destroyed || piece.connectedToCore) {
        continue;
      }

      const isInRange = sources.some((source) => {
        const distance = Math.hypot(source.x - piece.x, source.y - piece.y);
        return distance <= COLLECTION_RANGE;
      });

      if (isInRange) {
        piece.collected = true;
        collected.push(piece);
      }
    }

    return collected;
  }

  function tickWeaponEffects(world, dt) {
    for (const effect of world.weaponEffects) {
      effect.ttl -= dt;
    }

    world.weaponEffects = world.weaponEffects.filter((effect) => effect.ttl > 0);

    if (world.weaponEffects.length > MAX_WORLD_WEAPON_EFFECTS) {
      world.weaponEffects = world.weaponEffects.slice(-MAX_WORLD_WEAPON_EFFECTS);
    }
  }

  function pruneWorldState(world, activeAnchors = [world.ship]) {
    let changed = false;

    if (Array.isArray(world.pieces)) {
      const previousCount = world.pieces.length;
      world.pieces = world.pieces.filter((piece) => (
        !piece.collected &&
        !piece.destroyed &&
        shouldRetainWorldPiece(piece, activeAnchors)
      ));
      changed ||= world.pieces.length !== previousCount;
    }

    if (Array.isArray(world.enemies)) {
      const previousCount = world.enemies.length;
      world.enemies = world.enemies.filter((enemy) => enemy && !enemy.dead);
      changed ||= world.enemies.length !== previousCount;
      syncPrimaryEnemy(world);
    }

    if (Array.isArray(world.traders)) {
      const previousCount = world.traders.length;
      world.traders = world.traders.filter((trader) => trader && !trader.dead).slice(0, WORLD_MAX_TRADERS);
      changed ||= world.traders.length !== previousCount;
    }

    return changed;
  }

  function shouldRetainWorldPiece(piece, activeAnchors) {
    if (piece.connectedToCore) {
      return true;
    }

    if (!isGeneratedLoosePiece(piece)) {
      return true;
    }

    return isPointNearActiveAnchors(piece, activeAnchors, WORLD_SPAWN_RETENTION_RADIUS);
  }

  function isGeneratedLoosePiece(piece) {
    return (
      String(piece.id ?? "").startsWith("spawned-") ||
      String(piece.id ?? "").includes("-scrap-")
    );
  }

  function getScaffoldWorldPoints(board, body) {
    const points = [];

    for (const row of board) {
      for (const cell of row) {
        if (cell.base?.id === "ship-scaffold") {
          points.push(localToWorld(body, cell.x - CORE_X, cell.y - CORE_Y));
        }
      }
    }

    return points;
  }

  function getBoardEngineParts(board) {
    const engines = [];

    for (const row of board) {
      for (const cell of row) {
        if (!isEngineTile(cell.block?.id)) {
          continue;
        }

        engines.push({
          key: getBoardPartKey(cell),
          tileId: cell.block.id,
          cell,
          localX: cell.x - CORE_X,
          localY: cell.y - CORE_Y,
          direction: cell.block.direction ?? "up",
          requiresPower: true,
        });
      }
    }

    return engines;
  }

  function getBoardWeaponParts(board) {
    const weapons = [];

    for (const row of board) {
      for (const cell of row) {
        if (isWeaponTile(cell.block?.id)) {
          weapons.push({
            key: getBoardPartKey(cell),
            tileId: cell.block.id,
            cell,
            localX: cell.x - CORE_X,
            localY: cell.y - CORE_Y,
          });
        }
      }
    }

    return weapons;
  }

  function getBoardBlockParts(board, blockId) {
    const parts = [];

    for (const row of board) {
      for (const cell of row) {
        if (cell.block?.id === blockId) {
          parts.push({
            key: getBoardPartKey(cell),
            tileId: blockId,
            cell,
            localX: cell.x - CORE_X,
            localY: cell.y - CORE_Y,
            requiresPower: true,
          });
        }
      }
    }

    return parts;
  }

  function getCellEngineParts(cells) {
    return cells
      .filter((cell) => isEngineTile(cell.block?.id))
      .map((cell) => ({
        key: getLocalPartKey(cell),
        tileId: cell.block.id,
        cell,
        localX: cell.x,
        localY: cell.y,
        direction: cell.block.direction ?? "up",
        requiresPower: true,
      }));
  }

  function getEnemyWeaponParts(cells) {
    return cells
      .filter((cell) => isWeaponTile(cell.block?.id))
      .map((cell) => ({
        key: getLocalPartKey(cell),
        tileId: cell.block.id,
        cell,
        localX: cell.x,
        localY: cell.y,
        requiresPower: true,
      }));
  }

  function getWorldStats(world, board, activeEngineIds) {
    syncPrimaryEnemy(world);
    const scaffoldPoints = getScaffoldWorldPoints(board, world.ship);
    const loosePieces = world.pieces.filter((piece) => (
      !piece.collected && !piece.destroyed && !piece.connectedToCore
    )).length;
    const liveEnemies = getLiveEnemies(world);
    const coreLinkedPieces = liveEnemies.reduce((total, enemy) => total + Math.max(0, enemy.cells.length - 1), 0);

    return {
      activeEngines: activeEngineIds.size,
      enemyCoreOnline: liveEnemies.length > 0,
      liveEnemies: liveEnemies.length,
      loosePieces,
      coreLinkedPieces,
      reach: scaffoldPoints.length,
      speed: Math.round(Math.hypot(world.ship.vx, world.ship.vy)),
      uncollectedPieces: loosePieces + coreLinkedPieces,
    };
  }

  function hasAmmoActivity(board) {
    for (const row of board) {
      for (const cell of row) {
        if (AMMO_FACTORY_TILE_IDS.includes(cell.block?.id)) {
          return true;
        }

        if (isConveyorTile(cell.block?.id) && (cell.block.ammo ?? 0) > 0) {
          return true;
        }
      }
    }

    return false;
  }

  function hasWeaponCooldowns(board) {
    for (const row of board) {
      for (const cell of row) {
        if (isCoolingDown(cell.block)) {
          return true;
        }
      }
    }

    return false;
  }

  function hasRepairBotActivity(world, board, activeEngineIds = new Set()) {
    if (!world?.ship || !isPlayerShipStill(world.ship, activeEngineIds)) {
      return false;
    }

    return getPoweredRepairBots(board).some((repairBot) => findRepairBotTarget(board, repairBot.cell));
  }

  function hasShieldRegenActivity(board) {
    return getPoweredShieldBlocks(board).some((shield) => {
      const block = shield.cell.block;
      ensureTileHealth(block);
      ensureShieldCharge(block);
      return block.hp > 0 && block.shieldHp < block.shieldMaxHp;
    });
  }

  function isWeaponTile(tileId) {
    return WEAPON_TILE_IDS.includes(tileId);
  }

  function isCannonWeapon(tileId) {
    return CANNON_TILE_IDS.includes(tileId);
  }

  function isConveyorTile(tileId) {
    return CONVEYOR_TILE_IDS.includes(tileId);
  }

  function isEngineTile(tileId) {
    return ENGINE_TILE_IDS.includes(tileId);
  }

  function isWeaponBlock(block) {
    return isWeaponTile(block?.id);
  }

  function requiresPower(tileId) {
    return (POWER_REQUIREMENT_BY_TILE[tileId] ?? 0) > 0;
  }

  function isCoolingDown(block) {
    return isWeaponBlock(block) && (block.cooldownRemaining ?? 0) > 0.001;
  }

  function getAmmoFactoryInterval(tileId, techIds = new Set()) {
    let interval = AMMO_FACTORY_INTERVAL_BY_TILE[tileId] ?? AMMO_FACTORY_INTERVAL_BY_TILE["ammo-factory"] ?? 1.1;

    if (hasTech(techIds, "feed-gates")) {
      interval *= 0.9;
    }

    if (hasTech(techIds, "loader-automation")) {
      interval *= 0.85;
    }

    if (hasTech(techIds, "factory-overclock")) {
      interval *= 0.9;
    }

    return interval;
  }

  function getConveyorAmmoInterval(techIds = new Set()) {
    let interval = CONVEYOR_AMMO_INTERVAL;

    if (hasTech(techIds, "ammo-routing")) {
      interval *= 0.85;
    }

    if (hasTech(techIds, "loader-automation")) {
      interval *= 0.9;
    }

    return interval;
  }

  function getEngineForce(tileId, techIds = new Set()) {
    let force = ENGINE_FORCE_BY_TILE[tileId] ?? ENGINE_FORCE_BY_TILE.engine ?? ENGINE_FORCE;

    if (hasTech(techIds, "gimbal-mounts")) {
      force *= 1.08;
    }

    if (hasTech(techIds, "thrust-vectoring")) {
      force *= 1.08;
    }

    if (hasTech(techIds, "injector-tuning")) {
      force *= 1.1;
    }

    if (hasTech(techIds, "micro-jump-plating")) {
      force *= 1.08;
    }

    return force;
  }

  function getLinearDamping(techIds = new Set()) {
    if (hasTech(techIds, "mass-balancing")) {
      return 0.94;
    }

    return hasTech(techIds, "inertial-dampers") ? 0.95 : LINEAR_DAMPING;
  }

  function getAngularDamping(techIds = new Set()) {
    return hasTech(techIds, "inertial-dampers") ? 0.9 : ANGULAR_DAMPING;
  }

  function getWeaponCooldown(tileId, techIds = new Set()) {
    let cooldown = WEAPON_COOLDOWNS[tileId] ?? 0;

    if (isCannonWeapon(tileId) && hasTech(techIds, "magnetic-loaders")) {
      cooldown *= 0.88;
    }

    if (isLaserWeapon(tileId) && hasTech(techIds, "burst-cyclers")) {
      cooldown *= 0.92;
    }

    return cooldown;
  }

  function getWeaponRange(tileId, techIds = new Set()) {
    let range = WEAPON_RANGES[tileId] ?? WEAPON_RANGES.laser ?? 850;

    if (hasTech(techIds, "targeting-computer")) {
      range *= 1.1;
    }

    if (isLaserWeapon(tileId) && hasTech(techIds, "focused-optics")) {
      range *= 1.08;
    }

    return range;
  }

  function getCannonProjectileSpeed(tileId, techIds = new Set()) {
    let speed = CANNON_PROJECTILE_SPEED;

    if (isCannonWeapon(tileId) && hasTech(techIds, "projectile-ballistics")) {
      speed *= 1.08;
    }

    return speed;
  }

  function getCannonProjectileTtl(tileId, techIds = new Set()) {
    return getWeaponRange(tileId, techIds) / getCannonProjectileSpeed(tileId, techIds);
  }

  function getWeaponDamage(tileId, techIds = new Set()) {
    let damage = WEAPON_DAMAGE[tileId] ?? 0;

    if (isLaserWeapon(tileId) && hasTech(techIds, "laser-capacitors")) {
      damage *= 1.1;
    }

    if (isCannonWeapon(tileId) && hasTech(techIds, "projectile-ballistics")) {
      damage *= 1.12;
    }

    if (isCannonWeapon(tileId) && hasTech(techIds, "kinetic-penetrators")) {
      damage *= 1.1;
    }

    return damage;
  }

  function isLaserWeapon(tileId) {
    return isWeaponTile(tileId) && !isCannonWeapon(tileId);
  }

  function normalizeTechIds(techIds) {
    if (techIds instanceof Set) {
      return techIds;
    }

    if (Array.isArray(techIds)) {
      return new Set(techIds);
    }

    return new Set();
  }

  function hasTech(techIds, techId) {
    return techIds instanceof Set && techIds.has(techId);
  }

  function damageTile(tile, damage) {
    ensureTileHealth(tile);
    tile.hp = Math.max(0, tile.hp - damage);
    return tile.hp <= 0;
  }

  function ensurePieceHealth(piece) {
    const maxHp = piece.maxHp ?? getTileMaxHp(piece.tileId);
    piece.maxHp = maxHp;

    if (typeof piece.hp !== "number") {
      piece.hp = maxHp;
    }

    piece.hp = clamp(piece.hp, 0, maxHp);
    return piece;
  }

  function getEnemyDistance(world) {
    const liveEnemies = [
      ...getLiveEnemies(world),
      ...getLiveTraders(world).filter((trader) => trader.hostileToPlayer),
    ];

    if (!liveEnemies.length) {
      return Infinity;
    }

    return liveEnemies.reduce((closest, enemy) => (
      Math.min(closest, Math.hypot(enemy.body.x - world.ship.x, enemy.body.y - world.ship.y))
    ), Infinity);
  }

  function isEnemyShipNearby(world) {
    return getEnemyDistance(world) <= BUILD_LOCKOUT_DISTANCE;
  }

  function formatTileName(tileId) {
    return tileId
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function localToWorld(body, localX, localY) {
    const point = rotateVector(
      {
        x: localX * SHIP_WORLD_SCALE,
        y: localY * SHIP_WORLD_SCALE,
      },
      body.angle,
    );

    return {
      x: body.x + point.x,
      y: body.y + point.y,
    };
  }

  function rotateVector(vector, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return {
      x: vector.x * cos - vector.y * sin,
      y: vector.x * sin + vector.y * cos,
    };
  }

  function getBoardPartKey(cell) {
    return `${cell.x},${cell.y}`;
  }

  function getLocalPartKey(cell) {
    return `${cell.x},${cell.y}`;
  }

  function normalizeAngle(angle) {
    let normalized = angle;

    while (normalized > Math.PI) {
      normalized -= Math.PI * 2;
    }

    while (normalized < -Math.PI) {
      normalized += Math.PI * 2;
    }

    return normalized;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizePoint(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }

    return {
      x: point.x,
      y: point.y,
    };
  }

  function normalizeWorldZone(zone) {
    return ["outer", "middle", "core"].includes(zone) ? zone : "outer";
  }

  function getWorldZoneAtPoint(point) {
    const distance = Math.hypot(point.x - WORLD_CENTER_X, point.y - WORLD_CENTER_Y);

    if (distance <= WORLD_CORE_RADIUS) {
      return "core";
    }

    if (distance <= WORLD_MIDDLE_RADIUS) {
      return "middle";
    }

    return "outer";
  }

  function getZoneBounds(zone) {
    const normalized = normalizeWorldZone(zone);

    if (normalized === "core") {
      return { min: 0, max: WORLD_CORE_RADIUS };
    }

    if (normalized === "middle") {
      return { min: WORLD_CORE_RADIUS, max: WORLD_MIDDLE_RADIUS };
    }

    return { min: WORLD_MIDDLE_RADIUS, max: WORLD_RADIUS };
  }

  function getPointInZone(zone, angle, band = 0.5) {
    const bounds = getZoneBounds(zone);
    const innerPadding = bounds.min > 0 ? 120 : 140;
    const outerPadding = 160;
    const minRadius = Math.min(bounds.max - outerPadding, bounds.min + innerPadding);
    const maxRadius = Math.max(minRadius, bounds.max - outerPadding);
    const radius = minRadius + (maxRadius - minRadius) * clamp(band, 0, 1);
    return {
      x: WORLD_CENTER_X + Math.cos(angle) * radius,
      y: WORLD_CENTER_Y + Math.sin(angle) * radius,
    };
  }

  function clampPointToWorldCircle(point, margin = 45) {
    const radial = getRadialState(point);
    const radius = Math.min(radial.distance, Math.max(80, WORLD_RADIUS - margin));
    return {
      x: WORLD_CENTER_X + radial.nx * radius,
      y: WORLD_CENTER_Y + radial.ny * radius,
    };
  }

  function clampPointToZone(point, zone, margin = 80) {
    const bounds = getZoneBounds(zone);
    const radial = getRadialState(point);
    const minRadius = Math.max(0, bounds.min + (bounds.min > 0 ? margin : 0));
    const maxRadius = Math.max(minRadius + 1, bounds.max - margin);
    const radius = clamp(radial.distance, minRadius, maxRadius);
    return {
      x: WORLD_CENTER_X + radial.nx * radius,
      y: WORLD_CENTER_Y + radial.ny * radius,
    };
  }

  function isPointInsideWorldCircle(point, margin = 0) {
    return Math.hypot(point.x - WORLD_CENTER_X, point.y - WORLD_CENTER_Y) <= WORLD_RADIUS + margin;
  }

  function createSharedWorldSnapshot(world) {
    syncPrimaryEnemy(world);
    return clonePlain({
      enemies: getEnemies(world).map(serializeEnemy),
      traders: getTraders(world).map(serializeTrader),
      enemy: {
        ...world.enemy,
        activeEngines: [...world.enemy.activeEngines],
        cells: world.enemy.cells,
      },
      pieces: world.pieces,
      projectiles: world.projectiles,
      weaponEffects: world.weaponEffects,
      partSpawnTimer: world.partSpawnTimer,
      enemySpawnTimer: world.enemySpawnTimer,
      traderSpawnTimer: world.traderSpawnTimer,
      spawnedEnemyCount: world.spawnedEnemyCount,
      spawnedPieceCount: world.spawnedPieceCount,
      spawnedTraderCount: world.spawnedTraderCount,
    });
  }

  function serializeEnemy(enemy) {
    return {
      ...enemy,
      activeEngines: [...(enemy.activeEngines ?? [])],
      cells: enemy.cells,
    };
  }

  function serializeTrader(trader) {
    return {
      ...trader,
      activeEngines: [...(trader.activeEngines ?? [])],
      cells: trader.cells,
      stock: trader.stock,
    };
  }

  function applySharedWorldSnapshot(world, snapshot) {
    if (!snapshot) {
      clearSharedWorldState(world);
      return;
    }

    const hasEnemyList = Array.isArray(snapshot.enemies);
    const enemies = hasEnemyList ? snapshot.enemies : createMigratedEnemyList(snapshot.enemy);

    world.enemies = enemies.map(hydrateEnemy);
    world.traders = Array.isArray(snapshot.traders)
      ? snapshot.traders.map(hydrateTrader).slice(0, WORLD_MAX_TRADERS)
      : createTraderShips(getOuterStartPoint().x, getOuterStartPoint().y);
    syncPrimaryEnemy(world);
    world.pieces = hasEnemyList
      ? clonePlain(snapshot.pieces ?? [])
      : createMigratedPieceList(snapshot.pieces ?? []);
    world.projectiles = clonePlain(snapshot.projectiles ?? []);
    world.weaponEffects = clonePlain(snapshot.weaponEffects ?? []);
    world.partSpawnTimer = Number.isFinite(snapshot.partSpawnTimer)
      ? snapshot.partSpawnTimer
      : WORLD_PART_SPAWN_INTERVAL;
    world.enemySpawnTimer = Number.isFinite(snapshot.enemySpawnTimer)
      ? snapshot.enemySpawnTimer
      : WORLD_ENEMY_SPAWN_INTERVAL;
    world.traderSpawnTimer = Number.isFinite(snapshot.traderSpawnTimer)
      ? snapshot.traderSpawnTimer
      : WORLD_TRADER_SPAWN_INTERVAL;
    world.spawnedEnemyCount = Number.isFinite(snapshot.spawnedEnemyCount)
      ? snapshot.spawnedEnemyCount
      : getEnemies(world).length;
    world.spawnedPieceCount = Number.isFinite(snapshot.spawnedPieceCount)
      ? snapshot.spawnedPieceCount
      : (world.pieces ?? []).length;
    world.spawnedTraderCount = Number.isFinite(snapshot.spawnedTraderCount)
      ? snapshot.spawnedTraderCount
      : getTraders(world).length;
  }

  function createMigratedEnemyList(enemy) {
    if (!enemy) {
      return [];
    }

    const defaultEnemies = createEnemyShips().map(serializeEnemy);
    return [
      {
        ...enemy,
        id: enemy.id ?? defaultEnemies[0].id,
      },
      ...defaultEnemies.slice(1),
    ];
  }

  function createMigratedPieceList(pieces) {
    const migratedPieces = clonePlain(pieces);
    const visibleLoosePieces = migratedPieces.filter((piece) => (
      !piece.collected && !piece.destroyed && !piece.connectedToCore
    ));

    if (visibleLoosePieces.length >= 20) {
      return migratedPieces;
    }

    const existingIds = new Set(migratedPieces.map((piece) => piece.id));
    const start = getOuterStartPoint();
    const generatedPieces = createInitialLoosePieces(start.x, start.y)
      .filter((piece) => !piece.id.includes("-near-"));

    for (const piece of generatedPieces) {
      if (existingIds.has(piece.id)) {
        continue;
      }

      migratedPieces.push(piece);
    }

    return migratedPieces;
  }

  function hydrateEnemy(enemy = {}) {
    const hydrated = {
      id: enemy.id ?? `enemy-${Math.random().toString(16).slice(2)}`,
      body: clonePlain(enemy.body) ?? createShipBody(0, 0, 0),
      dead: Boolean(enemy.dead),
      aiTimer: Number(enemy.aiTimer ?? 0),
      activeEngines: new Set(enemy.activeEngines ?? []),
      zone: normalizeWorldZone(enemy.zone ?? getEnemyTemplate(enemy.id ?? "").zone ?? getWorldZoneAtPoint(enemy.body ?? { x: WORLD_CENTER_X, y: WORLD_CENTER_Y })),
      cells: clonePlain(enemy.cells ?? []),
    };
    refreshNpcPower(hydrated.cells);
    return hydrated;
  }

  function hydrateTrader(trader = {}) {
    const hydrated = {
      id: trader.id ?? `trader-${Math.random().toString(16).slice(2)}`,
      name: trader.name,
      body: clonePlain(trader.body) ?? createShipBody(0, 0, 0),
      dead: Boolean(trader.dead),
      hostileToPlayer: Boolean(trader.hostileToPlayer),
      aiTimer: Number(trader.aiTimer ?? 0),
      wanderTimer: Number(trader.wanderTimer ?? 0),
      wanderTarget: normalizePoint(trader.wanderTarget),
      activeEngines: new Set(trader.activeEngines ?? []),
      cells: clonePlain(trader.cells ?? []),
      stock: clonePlain(trader.stock ?? []),
    };
    hydrateTraderShape(hydrated);
    refreshNpcPower(hydrated.cells);
    return hydrated;
  }

  function clearSharedWorldState(world) {
    world.enemies = [];
    world.traders = [];
    syncPrimaryEnemy(world);
    world.pieces = [];
    world.projectiles = [];
    world.weaponEffects = [];
    world.partSpawnTimer = WORLD_PART_SPAWN_INTERVAL;
    world.enemySpawnTimer = WORLD_ENEMY_SPAWN_INTERVAL;
    world.traderSpawnTimer = WORLD_TRADER_SPAWN_INTERVAL;
    world.spawnedEnemyCount = 0;
    world.spawnedPieceCount = 0;
    world.spawnedTraderCount = 0;
  }

  function clonePlain(value) {
    if (value === undefined || value === null) {
      return value;
    }

    return JSON.parse(JSON.stringify(value));
  }

  spaceCore.worldSystem = {
    createWorldState,
    stepWorld,
    fireWeapons,
    createSharedWorldSnapshot,
    applySharedWorldSnapshot,
    clearSharedWorldState,
    destroyEnemyCore,
    collectNearbyPieces,
    collectNearbyPiecesForShip,
    getTraders,
    getLiveTraders,
    getTraderById,
    getNearestTraderInRange,
    buyTraderStockSlot,
    refreshTraderStock,
    getTraderSellPrice,
    getBoardEngineParts,
    getBoardWeaponParts,
    getBoardPartKey,
    getScaffoldWorldPoints,
    absorbDamageWithNearbyShield,
    getWorldStats,
    hasAmmoActivity,
    hasWeaponCooldowns,
    hasRepairBotActivity,
    hasShieldRegenActivity,
    getEnemyDistance,
    isEnemyShipNearby,
  };
})(window.SpaceCore = window.SpaceCore || {});
