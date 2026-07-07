(function (spaceCore) {
  "use strict";

  const {
    DIRECTIONS,
    INITIAL_INVENTORY,
    INITIAL_SCRAP,
    POWER_GENERATOR_TILE_IDS,
    INITIAL_WORLD_ZOOM,
    RESEARCH_PROJECTS,
    WORLD_ZOOM_MIN,
    WORLD_ZOOM_MAX,
    WORLD_ZOOM_STEP,
    BUILD_LOCKOUT_DISTANCE,
    TRADER_TRADE_RADIUS,
    TRADER_REFRESH_COST,
  } = spaceCore.config;
  const { TILES, findTileById } = spaceCore.tileCatalog;
  const { createBoard, getCell } = spaceCore.boardModel;
  const { ensureTileHealth } = spaceCore.tileState;
  const { validatePlacement, createPlacedTile } = spaceCore.placementRules;
  const { calculatePower, getStats } = spaceCore.powerSystem;
  const {
    renderPalette,
    renderBoard,
    renderInspector,
    renderInventory,
    renderStats,
    renderTechTree,
    renderTradeMenu,
    renderWorld,
    updateWorldMotion,
    setStatus,
  } = spaceCore.renderers;
  const {
    createWorldState,
    stepWorld,
    fireWeapons,
    createSharedWorldSnapshot,
    applySharedWorldSnapshot,
    clearSharedWorldState,
    collectNearbyPieces,
    collectNearbyPiecesForShip,
    getBoardEngineParts,
    getBoardWeaponParts,
    absorbDamageWithNearbyShield,
    getWorldStats,
    hasAmmoActivity,
    hasWeaponCooldowns,
    hasRepairBotActivity,
    hasShieldRegenActivity,
    getLiveTraders,
    getNearestTraderInRange,
    getTraderById,
    buyTraderStockSlot,
    refreshTraderStock,
    getTraderSellPrice,
    getEnemyDistance,
    isEnemyShipNearby,
  } = spaceCore.worldSystem;
  const { createMultiplayerClient } = spaceCore.multiplayer;
  const SAVE_STORAGE_KEY = "space-core-save-v1";
  const TUTORIAL_STORAGE_KEY = "space-core-tutorial-complete-v1";
  const MULTIPLAYER_SNAPSHOT_INTERVAL = 0.1;
  const MULTIPLAYER_WORLD_STATE_INTERVAL = 0.2;
  const TEST_MODE = new URLSearchParams(window.location.search).has("test");
  const TUTORIAL_STEPS = [
    {
      key: "build",
      title: "Build Around The Core",
      copy: "Your core is the heart of the ship. Add scaffold beside it, then mount useful blocks on the scaffold.",
      points: [
        "Scaffold expands the hull from the core.",
        "Blocks need scaffold before they can be placed.",
        "Use erase and reset when a layout is not working.",
      ],
    },
    {
      key: "power",
      title: "Power The Ship",
      copy: "Generators and electric cable create power networks. Engines, weapons, shields, factories, repair bots, and collectors only work when their network has enough output.",
      points: [
        "Generators add power to connected cable networks.",
        "Powered blocks shut off when demand is higher than supply.",
        "Click a generator in the build bay to inspect its network.",
      ],
    },
    {
      key: "movement",
      title: "Launch And Move",
      copy: "When the ship is ready, launch into the debris field. Select engines on the ship, turn them on, then turn them off when you want to slow down or repair.",
      points: [
        "Engine placement and facing affect thrust and turning.",
        "Zoom helps you inspect nearby debris and enemies.",
        "The build menu locks while hostile ships are too close.",
      ],
    },
    {
      key: "combat",
      title: "Select Weapons And Target",
      copy: "Weapons are selected directly on your ship. With a weapon selected, click a target point in the world to set a fire order.",
      points: [
        "Lasers need power and cool down between shots.",
        "Cannons need both power and delivered ammo.",
        "Destroy enemy cores to release surviving pieces.",
      ],
    },
    {
      key: "salvage",
      title: "Salvage, Trade, Research",
      copy: "Collected parts expand your inventory. Scrap and spare parts unlock research, and trader ships offer extra stock when you fly into their yellow trade radius.",
      points: [
        "Loose pieces near your scaffold are collected automatically.",
        "Salvage Collectors pull distant visible pieces into storage.",
        "Research unlocks stronger weapons, engines, generators, and logistics.",
      ],
    },
  ];

  const dom = spaceCore.dom.getDom();
  const state = {
    selectedTileId: "ship-scaffold",
    activeFilter: "all",
    directionIndex: 0,
    eraseMode: false,
    techTreeOpen: false,
    activeTechSection: "weapons",
    selectedTechProjectId: null,
    tutorialStepIndex: 0,
    hoverCell: null,
    hoverElement: null,
    scrap: INITIAL_SCRAP,
    inventory: { ...INITIAL_INVENTORY },
    unlockedTechIds: new Set(),
    board: createBoard(),
    world: createWorldState(),
    selectedEngineIds: new Set(),
    activeEngineIds: new Set(),
    selectedWeaponIds: new Set(),
    weaponOrder: null,
    tradeMenuOpen: false,
    activeTraderId: null,
    pendingTradeSlots: new Set(),
    controlGroups: {},
    pendingControlGroupAssignment: false,
    pendingPrivateServer: false,
    worldZoom: INITIAL_WORLD_ZOOM,
    centerConstructionOnNextRender: true,
    mode: "construction",
    multiplayer: {
      connected: false,
      clientId: null,
      hostId: null,
      roomId: null,
      role: "solo",
      isHost: false,
      peerCount: 0,
      lastSnapshotAt: 0,
      lastWorldStateAt: 0,
      worldSynced: false,
      sharedWorldRenderKey: "",
      remotePlayers: new Map(),
    },
  };
  let worldAnimationId = null;
  let scheduledWorldRenderId = null;
  let lastWorldFrame = 0;
  let multiplayerClient = null;
  let multiplayerConnectionToken = 0;
  let nextWeaponOrderId = 1;
  let defaultShareUrlText = window.location.origin;

  function getSelectedTile() {
    return findTileById(state.selectedTileId);
  }

  function validateCell(x, y) {
    const cell = getCell(state.board, x, y);

    if (state.eraseMode && cell?.base?.id === "ship-scaffold" && !cell.block && !cell.underlay) {
      if (wouldDisconnectScaffoldFromCore(cell)) {
        return { ok: false, message: "You need to deconstruct the other thing first." };
      }
    }

    const tile = getSelectedTile();

    if (isTileResearchLocked(tile)) {
      return { ok: false, message: `Research ${tile.name} before placing it.` };
    }

    return validatePlacement({
      board: state.board,
      x,
      y,
      tile,
      inventory: state.inventory,
      eraseMode: state.eraseMode,
    });
  }

  function placeTile(x, y) {
    const cell = getCell(state.board, x, y);

    if (!cell) {
      return;
    }

    if (state.eraseMode) {
      eraseTopTile(cell);
      return;
    }

    const tile = getSelectedTile();

    if (POWER_GENERATOR_TILE_IDS.includes(cell.block?.id) && tile.layer !== "underlay") {
      showPowerGeneratorSystem(cell);
      return;
    }

    const result = validateCell(x, y);

    if (!result.ok) {
      setStatus(dom, result.message, "bad");
      renderAll();
      return;
    }

    const placedTile = createPlacedTile(tile, state.directionIndex);
    state.inventory[tile.id] -= 1;

    if (tile.layer === "base") {
      cell.base = placedTile;
    }

    if (tile.layer === "block") {
      cell.block = placedTile;
    }

    if (tile.layer === "underlay") {
      cell.underlay = placedTile;
    }

    state.eraseMode = false;
    clearHoverPreview();
    ensureSelectedTileAvailable();
    setStatus(dom, `${tile.name} placed.`, "good");
    renderAll();
  }

  function eraseTopTile(cell) {
    if (cell.block) {
      returnTileToInventory(cell.block.id);
      cell.block = null;
      setStatus(dom, "Block removed.", "warn");
    } else if (cell.underlay) {
      returnTileToInventory(cell.underlay.id);
      cell.underlay = null;
      setStatus(dom, "Underlay removed.", "warn");
    } else if (cell.base?.id === "ship-scaffold") {
      if (wouldDisconnectScaffoldFromCore(cell)) {
        setStatus(dom, "You need to deconstruct the other thing first.", "bad");
      } else {
        returnTileToInventory(cell.base.id);
        cell.base = null;
        setStatus(dom, "Scaffold removed.", "warn");
      }
    } else {
      setStatus(dom, "Core cannot be removed.", "bad");
    }

    state.eraseMode = false;
    clearHoverPreview();
    renderAll();
  }

  function returnTileToInventory(tileId) {
    state.inventory[tileId] = (state.inventory[tileId] ?? 0) + 1;
  }

  function wouldDisconnectScaffoldFromCore(removedCell) {
    const reachable = new Set();
    const queue = [];
    const coreCell = getCell(state.board, spaceCore.config.CORE_X, spaceCore.config.CORE_Y);

    if (hasConnectedBaseForErase(coreCell, removedCell)) {
      queue.push(coreCell);
      reachable.add(getCellKey(coreCell));
    }

    while (queue.length > 0) {
      const cell = queue.shift();

      for (const neighbor of getBaseNeighborsForErase(cell, removedCell)) {
        const key = getCellKey(neighbor);

        if (reachable.has(key)) {
          continue;
        }

        reachable.add(key);
        queue.push(neighbor);
      }
    }

    for (const row of state.board) {
      for (const cell of row) {
        if (cell === removedCell || !cell.base) {
          continue;
        }

        if (!reachable.has(getCellKey(cell))) {
          return true;
        }
      }
    }

    return false;
  }

  function getBaseNeighborsForErase(cell, removedCell) {
    return [
      getCell(state.board, cell.x, cell.y - 1),
      getCell(state.board, cell.x + 1, cell.y),
      getCell(state.board, cell.x, cell.y + 1),
      getCell(state.board, cell.x - 1, cell.y),
    ].filter((neighbor) => hasConnectedBaseForErase(neighbor, removedCell));
  }

  function hasConnectedBaseForErase(cell, removedCell) {
    return Boolean(cell && cell !== removedCell && cell.base);
  }

  function getCellKey(cell) {
    return `${cell.x},${cell.y}`;
  }

  function showPowerGeneratorSystem(cell) {
    calculatePower(state.board, state.unlockedTechIds);
    const generated = Math.round(cell.powerNetworkGenerated ?? cell.powerGenerated ?? 0);
    const required = Math.round(cell.powerNetworkRequired ?? 0);
    const consumers = cell.powerNetworkConsumers ?? 0;
    const ratio = Math.round((cell.powerRatio ?? 0) * 100);
    const type = generated >= required ? "good" : "warn";
    setStatus(
      dom,
      `Power system: ${generated} generated / ${required} required. ${consumers} connected systems receive ${ratio}% of needed power.`,
      type,
    );
    renderAll();
  }

  function rotateSelection() {
    const tile = getSelectedTile();

    if (!tile.rotatable || state.eraseMode) {
      setStatus(dom, `${tile.name} does not rotate.`, "warn");
      return;
    }

    state.directionIndex = (state.directionIndex + 1) % DIRECTIONS.length;
    setStatus(dom, `${tile.name} facing ${DIRECTIONS[state.directionIndex]}.`, "good");
    renderAll();
  }

  function resetShip() {
    returnBoardPiecesToInventory();
    state.board = createBoard();
    state.eraseMode = false;
    state.techTreeOpen = false;
    state.selectedTechProjectId = null;
    state.tradeMenuOpen = false;
    state.activeTraderId = null;
    state.pendingTradeSlots.clear();
    state.hoverCell = null;
    state.hoverElement = null;
    state.centerConstructionOnNextRender = true;
    clearWeaponOrder();
    setStatus(dom, "Ship reset.", "warn");
    renderAll();
  }

  function saveAndQuit() {
    if (state.mode !== "construction") {
      setWorldStatus("Save from the build menu.", "warn");
      return;
    }

    const saved = writeSavedProgress();

    if (state.multiplayer.connected) {
      leaveMultiplayer(false);
    }

    if (saved) {
      showMainMenu("Progress saved. Choose a mode when you are ready.");
    } else {
      setStatus(dom, "Could not save progress.", "bad");
      renderAll();
    }
  }

  function writeSavedProgress() {
    try {
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(createSavePayload()));
      return true;
    } catch (error) {
      return false;
    }
  }

  function createSavePayload() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      board: clonePlain(state.board),
      inventory: clonePlain(state.inventory),
      scrap: state.scrap,
      unlockedTechIds: [...state.unlockedTechIds],
      activeTechSection: state.activeTechSection,
      directionIndex: state.directionIndex,
      selectedTileId: state.selectedTileId,
      worldZoom: state.worldZoom,
      world: {
        ship: clonePlain(state.world.ship),
        shared: createSharedWorldSnapshot(state.world),
      },
    };
  }

  function loadSavedProgress() {
    let payload;

    try {
      payload = JSON.parse(localStorage.getItem(SAVE_STORAGE_KEY) ?? "null");
    } catch (error) {
      return false;
    }

    if (!payload || payload.version !== 1 || !Array.isArray(payload.board)) {
      return false;
    }

    state.board = payload.board;
    state.inventory = {
      ...INITIAL_INVENTORY,
      ...(payload.inventory ?? {}),
    };
    state.scrap = Number.isFinite(payload.scrap) ? payload.scrap : INITIAL_SCRAP;
    state.unlockedTechIds = new Set(Array.isArray(payload.unlockedTechIds) ? payload.unlockedTechIds : []);
    state.activeTechSection = isResearchSection(payload.activeTechSection)
      ? payload.activeTechSection
      : "weapons";
    state.directionIndex = Number.isInteger(payload.directionIndex)
      ? clamp(payload.directionIndex, 0, DIRECTIONS.length - 1)
      : 0;
    const savedSelectedTile = findTileById(payload.selectedTileId);
    state.selectedTileId = savedSelectedTile && isTileBuildAvailable(savedSelectedTile)
      ? savedSelectedTile.id
      : getFirstAvailableBuildTileId() ?? "ship-scaffold";
    state.worldZoom = Number.isFinite(payload.worldZoom)
      ? clamp(payload.worldZoom, WORLD_ZOOM_MIN, WORLD_ZOOM_MAX)
      : INITIAL_WORLD_ZOOM;
    state.world = createWorldState();

    if (payload.world?.shared) {
      applySharedWorldSnapshot(state.world, payload.world.shared);
    }

    if (payload.world?.ship) {
      state.world.ship = {
        ...state.world.ship,
        ...payload.world.ship,
      };
    }

    clearTransientWorldState();
    return true;
  }

  function clearTransientWorldState() {
    state.eraseMode = false;
    state.techTreeOpen = false;
    state.selectedTechProjectId = null;
    state.hoverCell = null;
    state.hoverElement = null;
    state.selectedEngineIds.clear();
    state.activeEngineIds.clear();
    state.selectedWeaponIds.clear();
    clearWeaponOrder();
    state.tradeMenuOpen = false;
    state.activeTraderId = null;
    state.pendingTradeSlots.clear();
    state.controlGroups = {};
    state.pendingControlGroupAssignment = false;
    state.mode = "construction";
  }

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function returnBoardPiecesToInventory() {
    for (const row of state.board) {
      for (const cell of row) {
        if (cell.block) {
          returnTileToInventory(cell.block.id);
        }

        if (cell.underlay) {
          returnTileToInventory(cell.underlay.id);
        }

        if (cell.base?.id === "ship-scaffold") {
          returnTileToInventory(cell.base.id);
        }
      }
    }
  }

  function selectTile(tileId) {
    const tile = findTileById(tileId);

    if (!tile || tile.locked) {
      setStatus(dom, "That part is not available.", "warn");
      return;
    }

    if (isTileResearchLocked(tile)) {
      setStatus(dom, `Research ${tile.name} before using it.`, "warn");
      return;
    }

    if ((state.inventory[tile.id] ?? 0) < 1) {
      setStatus(dom, `No ${tile.name} parts stored.`, "warn");
      ensureSelectedTileAvailable();
      renderAll();
      return;
    }

    state.selectedTileId = tileId;
    state.eraseMode = false;
    setStatus(dom, `${tile.name} selected.`, "");
    renderAll();
  }

  function researchProject(project) {
    if (isProjectUnlocked(project)) {
      setStatus(dom, `${project.name} already researched.`, "warn");
      return;
    }

    if (!hasResearchPrerequisites(project)) {
      setStatus(dom, `Research ${formatMissingResearchPrerequisites(project)} first.`, "bad");
      return;
    }

    if (!canAffordResearch(project)) {
      setStatus(dom, `Need ${formatResearchCost(project)}.`, "bad");
      return;
    }

    state.scrap -= project.scrap;

    for (const [tileId, count] of Object.entries(project.parts ?? {})) {
      state.inventory[tileId] = Math.max(0, (state.inventory[tileId] ?? 0) - count);
    }

    state.unlockedTechIds.add(project.id);
    ensureSelectedTileAvailable();
    setStatus(dom, `${project.name} researched.`, "good");
    renderAll();
  }

  function openTechTree() {
    if (state.mode !== "construction") {
      return;
    }

    state.techTreeOpen = true;
    state.eraseMode = false;
    state.selectedTechProjectId = null;
    clearHoverPreview();
    setStatus(dom, "Research tech tree open.", "");
    renderAll();
  }

  function closeTechTree() {
    if (!state.techTreeOpen) {
      return;
    }

    state.techTreeOpen = false;
    state.selectedTechProjectId = null;
    setStatus(dom, `${getSelectedTile().name} selected.`, "");
    renderAll();
  }

  function selectTechSection(sectionId) {
    if (!isResearchSection(sectionId)) {
      return;
    }

    state.activeTechSection = sectionId;
    state.selectedTechProjectId = null;
    renderAll();
  }

  function selectTechProject(project) {
    state.selectedTechProjectId = project?.id ?? null;
    renderAll();
  }

  function closeTechProject() {
    state.selectedTechProjectId = null;
    renderAll();
  }

  function isResearchSection(sectionId) {
    return ["weapons", "mobility", "power", "logistics"].includes(sectionId);
  }

  function isTileResearchLocked(tile) {
    return Boolean(tile?.researchId && !state.unlockedTechIds.has(tile.researchId));
  }

  function isTileBuildAvailable(tile) {
    return Boolean(tile && !tile.locked && !isTileResearchLocked(tile) && (state.inventory[tile.id] ?? 0) > 0);
  }

  function getFirstAvailableBuildTileId(filter = state.activeFilter) {
    const matchingTile = TILES.find((tile) => (
      (filter === "all" || tile.layer === filter) && isTileBuildAvailable(tile)
    ));

    return matchingTile?.id ?? TILES.find(isTileBuildAvailable)?.id ?? null;
  }

  function ensureSelectedTileAvailable() {
    if (isTileBuildAvailable(getSelectedTile())) {
      return;
    }

    const nextTileId = getFirstAvailableBuildTileId();

    if (nextTileId) {
      state.selectedTileId = nextTileId;
      return;
    }

    state.selectedTileId = "ship-scaffold";
  }

  function isProjectUnlocked(project) {
    return state.unlockedTechIds.has(project.id);
  }

  function canAffordResearch(project) {
    if (state.scrap < project.scrap) {
      return false;
    }

    return Object.entries(project.parts ?? {}).every(([tileId, count]) => (
      (state.inventory[tileId] ?? 0) >= count
    ));
  }

  function hasResearchPrerequisites(project) {
    return (project.requires ?? []).every((projectId) => state.unlockedTechIds.has(projectId));
  }

  function formatMissingResearchPrerequisites(project) {
    return (project.requires ?? [])
      .filter((projectId) => !state.unlockedTechIds.has(projectId))
      .map((projectId) => RESEARCH_PROJECTS.find((candidate) => candidate.id === projectId)?.name ?? formatTileName(projectId))
      .join(", ");
  }

  function formatResearchCost(project) {
    const partCosts = Object.entries(project.parts ?? {})
      .map(([tileId, count]) => `${count} ${formatTileName(tileId)}`);

    return [...partCosts, `${project.scrap} scrap`].join(", ");
  }

  function openTradeMenu() {
    if (state.mode !== "world") {
      return;
    }

    const tradeInfo = getNearestTraderInRange(state.world);

    if (!tradeInfo?.trader) {
      setWorldStatus("Move inside a trader's yellow trade radius.", "warn");
      syncTradeButton();
      return;
    }

    state.tradeMenuOpen = true;
    state.activeTraderId = tradeInfo.trader.id;
    clearWorldSelection(`Trading with ${tradeInfo.trader.name ?? "trader"}.`, "good");
    renderWorldOnly();
  }

  function closeTradeMenu() {
    if (!state.tradeMenuOpen) {
      return;
    }

    state.tradeMenuOpen = false;
    state.activeTraderId = null;
    setWorldStatus("Trade closed.", "");
    renderWorldOnly();
  }

  function buyTradeSlot(slotIndex) {
    const trader = getActiveTrader();

    if (!canTradeWithTrader(trader)) {
      setWorldStatus("Move back into the trader's yellow trade radius.", "warn");
      renderWorldOnly();
      return;
    }

    const slotKey = getTradeSlotKey(trader.id, slotIndex);

    if (state.pendingTradeSlots.has(slotKey)) {
      return;
    }

    if (isGuestMultiplayer()) {
      requestHostTradePurchase(trader, slotIndex, slotKey);
      return;
    }

    const result = buyTraderStockSlot(trader, slotIndex, state.scrap);
    applyLocalTradePurchaseResult(result, trader.id, slotIndex);
  }

  function requestHostTradePurchase(trader, slotIndex, slotKey) {
    if (!multiplayerClient?.isOpen()) {
      setWorldStatus("Trade unavailable while disconnected.", "bad");
      return;
    }

    state.pendingTradeSlots.add(slotKey);
    multiplayerClient.send({
      type: "trade-buy-request",
      requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      traderId: trader.id,
      slotIndex,
      scrap: state.scrap,
    });
    setWorldStatus("Trade request sent.", "");
    renderWorldOnly();
  }

  function handleTradeBuyRequest(message) {
    if (!isMultiplayerHost() || !multiplayerClient?.isOpen()) {
      return;
    }

    const trader = getTraderById(state.world, message.traderId);
    const targetId = message.playerId;

    if (!trader || !targetId) {
      sendTradeBuyResult(targetId, {
        ok: false,
        requestId: message.requestId,
        traderId: message.traderId,
        slotIndex: message.slotIndex,
        message: "Trader unavailable.",
      });
      return;
    }

    if (!canTradeWithTrader(trader, targetId)) {
      sendTradeBuyResult(targetId, {
        ok: false,
        requestId: message.requestId,
        traderId: trader.id,
        slotIndex: message.slotIndex,
        message: "Move inside the trader's trade radius.",
      });
      return;
    }

    const result = buyTraderStockSlot(trader, message.slotIndex, Math.max(0, Number(message.scrap) || 0));
    sendTradeBuyResult(targetId, {
      ok: result.ok,
      requestId: message.requestId,
      traderId: trader.id,
      slotIndex: message.slotIndex,
      item: result.item,
      nextItem: result.nextItem,
      scrap: result.scrap,
      message: result.message,
    });

    if (result.ok) {
      setWorldStatus(`${trader.name ?? "Trader"} sold ${formatTradeItemName(result.item)} to Player ${targetId}.`, "good");
      renderWorldOnly();
      sendSharedWorldSnapshot(performance.now(), true);
    }
  }

  function sendTradeBuyResult(targetId, payload) {
    if (!targetId || !multiplayerClient?.isOpen()) {
      return;
    }

    multiplayerClient.send({
      type: "trade-buy-result",
      targetId,
      ...payload,
    });
  }

  function applyTradeBuyResult(message) {
    const slotIndex = Number(message.slotIndex);
    const slotKey = getTradeSlotKey(message.traderId, slotIndex);
    state.pendingTradeSlots.delete(slotKey);

    if (!message.ok) {
      setWorldStatus(message.message ?? "Trade failed.", "bad");
      renderWorldOnly();
      return;
    }

    const trader = getTraderById(state.world, message.traderId);

    if (trader?.stock && Number.isInteger(slotIndex)) {
      trader.stock[slotIndex] = message.nextItem;
    }

    applyTradeItemToInventory(message.item);

    if (Number.isFinite(message.scrap)) {
      state.scrap = Math.max(0, message.scrap);
    }

    ensureSelectedTileAvailable();
    setWorldStatus(`Bought ${formatTradeItemName(message.item)}.`, "good");
    renderAll();
  }

  function applyLocalTradePurchaseResult(result, traderId, slotIndex) {
    if (!result.ok) {
      setWorldStatus(result.message ?? "Trade failed.", "bad");
      renderWorldOnly();
      return;
    }

    state.scrap = result.scrap;
    applyTradeItemToInventory(result.item);
    ensureSelectedTileAvailable();
    setWorldStatus(`Bought ${formatTradeItemName(result.item)}.`, "good");
    renderAll();
    sendSharedWorldSnapshot(performance.now(), true);
  }

  function refreshTradeStock() {
    const trader = getActiveTrader();

    if (!canTradeWithTrader(trader)) {
      setWorldStatus("Move back into the trader's yellow trade radius.", "warn");
      renderWorldOnly();
      return;
    }

    const actionKey = getTradeActionKey(trader.id, "refresh");

    if (state.pendingTradeSlots.has(actionKey)) {
      return;
    }

    if (isGuestMultiplayer()) {
      requestHostTradeRefresh(trader, actionKey);
      return;
    }

    applyLocalTradeRefreshResult(refreshTraderStock(trader, state.scrap), trader.id);
  }

  function requestHostTradeRefresh(trader, actionKey) {
    if (!multiplayerClient?.isOpen()) {
      setWorldStatus("Trade unavailable while disconnected.", "bad");
      return;
    }

    state.pendingTradeSlots.add(actionKey);
    multiplayerClient.send({
      type: "trade-refresh-request",
      requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      traderId: trader.id,
      scrap: state.scrap,
    });
    setWorldStatus("Refresh request sent.", "");
    renderWorldOnly();
  }

  function handleTradeRefreshRequest(message) {
    if (!isMultiplayerHost() || !multiplayerClient?.isOpen()) {
      return;
    }

    const trader = getTraderById(state.world, message.traderId);
    const targetId = message.playerId;

    if (!trader || !targetId || !canTradeWithTrader(trader, targetId)) {
      sendTradeRefreshResult(targetId, {
        ok: false,
        requestId: message.requestId,
        traderId: message.traderId,
        message: "Move inside the trader's trade radius.",
      });
      return;
    }

    const result = refreshTraderStock(trader, Math.max(0, Number(message.scrap) || 0));
    sendTradeRefreshResult(targetId, {
      ok: result.ok,
      requestId: message.requestId,
      traderId: trader.id,
      stock: result.stock,
      scrap: result.scrap,
      cost: result.cost,
      message: result.message,
    });

    if (result.ok) {
      setWorldStatus(`${trader.name ?? "Trader"} refreshed stock for Player ${targetId}.`, "good");
      renderWorldOnly();
      sendSharedWorldSnapshot(performance.now(), true);
    }
  }

  function sendTradeRefreshResult(targetId, payload) {
    if (!targetId || !multiplayerClient?.isOpen()) {
      return;
    }

    multiplayerClient.send({
      type: "trade-refresh-result",
      targetId,
      ...payload,
    });
  }

  function applyTradeRefreshResult(message) {
    state.pendingTradeSlots.delete(getTradeActionKey(message.traderId, "refresh"));

    if (!message.ok) {
      setWorldStatus(message.message ?? "Refresh failed.", "bad");
      renderWorldOnly();
      return;
    }

    const trader = getTraderById(state.world, message.traderId);

    if (trader && Array.isArray(message.stock)) {
      trader.stock = message.stock;
    }

    if (Number.isFinite(message.scrap)) {
      state.scrap = Math.max(0, message.scrap);
    }

    setWorldStatus(`Trader stock refreshed for ${message.cost ?? TRADER_REFRESH_COST} scrap.`, "good");
    renderAll();
  }

  function applyLocalTradeRefreshResult(result, traderId) {
    if (!result.ok) {
      setWorldStatus(result.message ?? "Refresh failed.", "bad");
      renderWorldOnly();
      return;
    }

    state.scrap = result.scrap;
    setWorldStatus(`Trader stock refreshed for ${result.cost ?? TRADER_REFRESH_COST} scrap.`, "good");
    renderAll();
    sendSharedWorldSnapshot(performance.now(), true);
  }

  function sellTradeItem(tileId) {
    const trader = getActiveTrader();

    if (!canTradeWithTrader(trader)) {
      setWorldStatus("Move back into the trader's yellow trade radius.", "warn");
      renderWorldOnly();
      return;
    }

    if ((state.inventory[tileId] ?? 0) <= 0) {
      setWorldStatus("You do not have that part to sell.", "warn");
      renderWorldOnly();
      return;
    }

    const actionKey = getTradeActionKey(trader.id, `sell:${tileId}`);

    if (state.pendingTradeSlots.has(actionKey)) {
      return;
    }

    if (isGuestMultiplayer()) {
      requestHostTradeSell(trader, tileId, actionKey);
      return;
    }

    applyLocalTradeSellResult({
      ok: true,
      traderId: trader.id,
      tileId,
      quantity: 1,
      price: getTraderSellPrice(tileId, 1),
      scrap: state.scrap + getTraderSellPrice(tileId, 1),
    });
  }

  function requestHostTradeSell(trader, tileId, actionKey) {
    if (!multiplayerClient?.isOpen()) {
      setWorldStatus("Trade unavailable while disconnected.", "bad");
      return;
    }

    state.pendingTradeSlots.add(actionKey);
    multiplayerClient.send({
      type: "trade-sell-request",
      requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      traderId: trader.id,
      tileId,
      quantity: 1,
      scrap: state.scrap,
    });
    setWorldStatus("Sell request sent.", "");
    renderWorldOnly();
  }

  function handleTradeSellRequest(message) {
    if (!isMultiplayerHost() || !multiplayerClient?.isOpen()) {
      return;
    }

    const trader = getTraderById(state.world, message.traderId);
    const targetId = message.playerId;
    const tileId = message.tileId;

    if (!trader || !targetId || !findTileById(tileId) || !canTradeWithTrader(trader, targetId)) {
      sendTradeSellResult(targetId, {
        ok: false,
        requestId: message.requestId,
        traderId: message.traderId,
        tileId,
        message: "Sale unavailable.",
      });
      return;
    }

    const quantity = Math.max(1, Number(message.quantity) || 1);
    const price = getTraderSellPrice(tileId, quantity);
    sendTradeSellResult(targetId, {
      ok: true,
      requestId: message.requestId,
      traderId: trader.id,
      tileId,
      quantity,
      price,
      scrap: Math.max(0, Number(message.scrap) || 0) + price,
    });
  }

  function sendTradeSellResult(targetId, payload) {
    if (!targetId || !multiplayerClient?.isOpen()) {
      return;
    }

    multiplayerClient.send({
      type: "trade-sell-result",
      targetId,
      ...payload,
    });
  }

  function applyTradeSellResult(message) {
    state.pendingTradeSlots.delete(getTradeActionKey(message.traderId, `sell:${message.tileId}`));

    if (!message.ok) {
      setWorldStatus(message.message ?? "Sale failed.", "bad");
      renderWorldOnly();
      return;
    }

    applyLocalTradeSellResult(message);
  }

  function applyLocalTradeSellResult(result) {
    const quantity = Math.max(1, Number(result.quantity) || 1);

    if (!result.ok || !removeSoldTradeItem(result.tileId, quantity)) {
      setWorldStatus(result.message ?? "Sale failed.", "bad");
      renderWorldOnly();
      return;
    }

    if (Number.isFinite(result.scrap)) {
      state.scrap = Math.max(0, result.scrap);
    } else {
      state.scrap += Math.max(0, Number(result.price) || 0);
    }

    ensureSelectedTileAvailable();
    setWorldStatus(`Sold ${quantity} ${formatTileName(result.tileId)} for ${result.price ?? getTraderSellPrice(result.tileId, quantity)} scrap.`, "good");
    renderAll();
  }

  function removeSoldTradeItem(tileId, quantity) {
    if (!tileId || (state.inventory[tileId] ?? 0) < quantity) {
      return false;
    }

    state.inventory[tileId] -= quantity;
    return true;
  }

  function applyTradeItemToInventory(item) {
    const quantity = Math.max(1, Number(item?.quantity) || 1);

    if (item?.kind === "artifact") {
      state.inventory.artifact = (state.inventory.artifact ?? 0) + quantity;
      return;
    }

    if (item?.tileId) {
      state.inventory[item.tileId] = (state.inventory[item.tileId] ?? 0) + quantity;
    }
  }

  function formatTradeItemName(item) {
    if (item?.kind === "artifact") {
      return item.name ?? "Ancient Artifact";
    }

    if (item?.tileId) {
      const tile = findTileById(item.tileId);
      return `${item.quantity ?? 1} ${tile?.name ?? formatTileName(item.tileId)}`;
    }

    return "stock";
  }

  function getActiveTrader() {
    return state.activeTraderId ? getTraderById(state.world, state.activeTraderId) : null;
  }

  function canTradeWithTrader(trader, buyerId = state.multiplayer.clientId) {
    if (!trader || trader.dead || trader.hostileToPlayer) {
      return false;
    }

    const body = getTradeBuyerBody(buyerId);

    if (!body) {
      return false;
    }

    return Math.hypot(trader.body.x - body.x, trader.body.y - body.y) <= TRADER_TRADE_RADIUS;
  }

  function getTradeBuyerBody(buyerId) {
    if (buyerId && buyerId !== state.multiplayer.clientId) {
      return state.multiplayer.remotePlayers.get(buyerId)?.body ?? null;
    }

    return state.world.ship;
  }

  function getTradeSlotKey(traderId, slotIndex) {
    return `${traderId ?? "none"}:${slotIndex}`;
  }

  function getTradeActionKey(traderId, action) {
    return `${traderId ?? "none"}:${action}`;
  }

  function getPendingTradeSlotIndexes(traderId) {
    const indexes = new Set();

    for (const key of state.pendingTradeSlots) {
      const [pendingTraderId, slotIndex] = key.split(":");

      if (pendingTraderId === traderId) {
        const index = Number(slotIndex);

        if (Number.isInteger(index)) {
          indexes.add(index);
        }
      }
    }

    return indexes;
  }

  function isGuestMultiplayer() {
    return state.multiplayer.connected && !state.multiplayer.isHost && state.multiplayer.role === "guest";
  }

  function enterEraseMode() {
    state.eraseMode = true;
    state.techTreeOpen = false;
    state.selectedTechProjectId = null;
    setStatus(dom, "Remove mode selected.", "warn");
    renderAll();
  }

  function enterWorld(options = {}) {
    const collectOnEntry = options.collectPieces ?? shouldSimulateSharedWorld();
    const createPrivateRoom = Boolean(options.createPrivateRoom || state.pendingPrivateServer);
    state.mode = "world";
    state.eraseMode = false;
    state.techTreeOpen = false;
    state.selectedTechProjectId = null;
    clearHoverPreview();
    showOnlyView("world");

    const collection = collectOnEntry
      ? collectNearbyPieces(state.world, state.board, state.inventory)
      : { collected: [], scrapCollected: 0 };
    applyScrapReward(collection.scrapCollected);
    const fallbackStatus = isEnemyShipNearby(state.world)
      ? "Enemy ship nearby. Build menu locked."
      : "Ship launched.";
    setWorldStatus(
      getCollectionMessage(getCollectedPartCount(collection), fallbackStatus, collection.scrapCollected),
      isEnemyShipNearby(state.world) ? "warn" : "",
    );
    renderAll();
    startWorldLoop();

    if (createPrivateRoom) {
      state.pendingPrivateServer = false;
    }

    if (createPrivateRoom && !state.multiplayer.connected) {
      connectMultiplayer({ asHost: true, createRoom: true });
    }
  }

  function enterConstruction() {
    if (isEnemyShipNearby(state.world)) {
      setWorldStatus(`Enemy ship within ${Math.round(getEnemyDistance(state.world))}. Build menu locked.`, "bad");
      syncBuildButton();
      return;
    }

    state.mode = "construction";
    stopWorldLoop();
    cancelScheduledWorldRender();
    state.tradeMenuOpen = false;
    state.activeTraderId = null;
    state.pendingTradeSlots.clear();
    showOnlyView("construction");
    state.centerConstructionOnNextRender = true;
    setStatus(dom, "Hangar ready.", "");
    renderAll();
  }

  function zoomWorld(delta) {
    state.worldZoom = clamp(
      state.worldZoom + delta,
      WORLD_ZOOM_MIN,
      WORLD_ZOOM_MAX,
    );
    setWorldStatus(`Zoom ${Math.round(state.worldZoom * 100)}%.`);
    renderWorldOnly();
  }

  function toggleEngineSelection(engineId) {
    state.pendingControlGroupAssignment = false;

    if (state.selectedEngineIds.has(engineId)) {
      state.selectedEngineIds.delete(engineId);
    } else {
      state.selectedEngineIds.add(engineId);
      state.selectedWeaponIds.clear();
    }

    setWorldStatus(`${state.selectedEngineIds.size} engines selected.`);
    renderWorldOnly();
  }

  function toggleWeaponSelection(weaponId) {
    state.pendingControlGroupAssignment = false;

    if (state.selectedWeaponIds.has(weaponId)) {
      state.selectedWeaponIds.delete(weaponId);
    } else {
      state.selectedWeaponIds.add(weaponId);
      state.selectedEngineIds.clear();
    }

    if (state.selectedWeaponIds.size === 0) {
      state.pendingControlGroupAssignment = false;
    }

    setWorldStatus(`${state.selectedWeaponIds.size} weapons selected.`);
    renderWorldOnly();
  }

  function turnSelectedEngines(on) {
    applyEngineOrder([...state.selectedEngineIds], on);
  }

  function applyEngineOrder(engineIds, on) {
    if (engineIds.length === 0) {
      setWorldStatus("No engines selected.", "warn");
      return;
    }

    for (const engineId of engineIds) {
      if (on) {
        state.activeEngineIds.add(engineId);
      } else {
        state.activeEngineIds.delete(engineId);
      }
    }

    setWorldStatus(on ? "Selected engines on." : "Selected engines off.", on ? "good" : "warn");
    renderWorldOnly();

    if (on && state.activeEngineIds.size > 0) {
      startWorldLoop();
    }
  }

  function clearWorldSelection(message = "Selection cleared.", type = "warn", forceStatus = true) {
    const hadSelection = hasWorldSelection() || Boolean(state.weaponOrder) || state.pendingControlGroupAssignment;

    state.selectedEngineIds.clear();
    state.selectedWeaponIds.clear();
    clearWeaponOrder();
    state.pendingControlGroupAssignment = false;

    if (!hadSelection && !forceStatus) {
      return;
    }

    setWorldStatus(message, type);
    renderWorldOnly();
  }

  function hasWorldSelection() {
    return state.selectedEngineIds.size > 0 || state.selectedWeaponIds.size > 0;
  }

  function beginControlGroupAssignment() {
    if (!hasWorldSelection()) {
      setWorldStatus("Select engines or weapons before assigning a group.", "warn");
      return;
    }

    state.pendingControlGroupAssignment = true;
    setWorldStatus("Press a number to save this control group.", "good");
  }

  function assignControlGroup(groupKey) {
    if (!hasWorldSelection()) {
      state.pendingControlGroupAssignment = false;
      setWorldStatus("No selected parts to save.", "warn");
      return;
    }

    state.controlGroups[groupKey] = {
      engines: [...state.selectedEngineIds],
      weapons: [...state.selectedWeaponIds],
    };
    state.pendingControlGroupAssignment = false;
    setWorldStatus(`Group ${groupKey} saved: ${describeSelection(state.controlGroups[groupKey])}.`, "good");
  }

  function selectControlGroup(groupKey) {
    const group = getLiveControlGroup(groupKey);

    if (!group || (group.engines.length === 0 && group.weapons.length === 0)) {
      state.pendingControlGroupAssignment = false;
      setWorldStatus(`Group ${groupKey} is empty.`, "warn");
      return;
    }

    state.selectedEngineIds = new Set(group.engines);
    state.selectedWeaponIds = new Set(group.weapons);
    state.pendingControlGroupAssignment = false;
    setWorldStatus(`Group ${groupKey} selected: ${describeSelection(group)}.`, "good");
    renderWorldOnly();
  }

  function getLiveControlGroup(groupKey) {
    const group = state.controlGroups[groupKey];

    if (!group) {
      return null;
    }

    const engineIds = new Set(getBoardEngineParts(state.board).map((engine) => engine.key));
    const weaponIds = new Set(getBoardWeaponParts(state.board).map((weapon) => weapon.key));

    return {
      engines: group.engines.filter((engineId) => engineIds.has(engineId)),
      weapons: group.weapons.filter((weaponId) => weaponIds.has(weaponId)),
    };
  }

  function describeSelection(group) {
    const parts = [];

    if (group.engines.length > 0) {
      parts.push(`${group.engines.length} ${group.engines.length === 1 ? "engine" : "engines"}`);
    }

    if (group.weapons.length > 0) {
      parts.push(`${group.weapons.length} ${group.weapons.length === 1 ? "weapon" : "weapons"}`);
    }

    return parts.join(", ") || "nothing";
  }

  function fireAtWorldTarget(target) {
    if (state.selectedWeaponIds.size === 0) {
      setWorldStatus("No weapons selected.", "warn");
      return;
    }

    const weaponIds = getLiveWeaponIds([...state.selectedWeaponIds]);

    if (weaponIds.length === 0) {
      state.selectedWeaponIds.clear();
      setWorldStatus("No weapons selected.", "warn");
      renderWorldOnly();
      return;
    }

    const isRetargeting = Boolean(state.weaponOrder);
    state.weaponOrder = {
      id: nextWeaponOrderId++,
      weaponIds,
      target,
    };

    const result = fireWeaponIdsAtTarget(weaponIds, target);
    sendRemoteDamageEvents(result.hits);
    handleWeaponFireResult(result, true, { retargeted: isRetargeting });
    if (hasStructuralHits(result.hits)) {
      renderWorldOnly();
    } else {
      refreshWeaponTargetMarker();
      updateWorldDynamicView();
    }

    startWorldLoop();
  }

  function fireWeaponIdsAtTarget(weaponIds, target) {
    const result = fireWeapons(
      state.world,
      state.board,
      new Set(weaponIds),
      target,
      state.inventory,
      getRemoteShips(),
      {
        includeWorldTargets: shouldSimulateSharedWorld(),
        techIds: state.unlockedTechIds,
      },
    );

    applyScrapReward(result.scrapCollected);
    return result;
  }

  function clearWeaponOrder() {
    state.weaponOrder = null;
  }

  function getLiveWeaponIds(weaponIds) {
    const boardWeaponIds = new Set(getBoardWeaponParts(state.board).map((weapon) => weapon.key));
    return weaponIds.filter((weaponId) => boardWeaponIds.has(weaponId));
  }

  function handleWeaponFireResult(result, announce, options = {}) {
    if (result.destroyedCore) {
      state.selectedWeaponIds.clear();
      clearWeaponOrder();
      const scrapText = result.scrapCollected > 0 ? ` ${result.scrapCollected} scrap collected.` : "";
      setWorldStatus(`Core destroyed. ${result.released} pieces released.${scrapText}`, "good");
    } else if (result.hits.length > 0) {
      setWorldStatus(getHitMessage(result.hits[0]), "good");
    } else if (!announce) {
      return;
    } else if (options.retargeted && result.coolingDown > 0) {
      setWorldStatus("Fire order retargeted. Weapons cooling down.", "good");
    } else if (options.retargeted && result.noPower > 0) {
      setWorldStatus("Fire order retargeted. Weapons need more power.", "warn");
    } else if (options.retargeted && result.fired === 0) {
      setWorldStatus("Fire order retargeted.", "good");
    } else if (result.fired > 0 && result.blocked > 0) {
      setWorldStatus(`${result.fired} fired. ${result.blocked} blocked by ship.`, "warn");
    } else if (result.fired > 0 && result.coolingDown > 0) {
      setWorldStatus(`${result.fired} fired. ${result.coolingDown} weapons cooling down.`, "warn");
    } else if (result.fired > 0 && result.noAmmo > 0) {
      setWorldStatus(`${result.fired} fired. ${result.noAmmo} cannons empty.`, "warn");
    } else if (result.fired > 0 && result.noPower > 0) {
      setWorldStatus(`${result.fired} fired. ${result.noPower} weapons need power.`, "warn");
    } else if (result.fired > 0) {
      setWorldStatus(`${result.fired} weapons fired.`);
    } else if (result.blocked > 0) {
      setWorldStatus("Shot blocked by ship.", "warn");
    } else if (result.coolingDown > 0) {
      setWorldStatus("Weapons cooling down.", "warn");
    } else if (result.noAmmo > 0) {
      setWorldStatus("Cannon empty.", "warn");
    } else if (result.noPower > 0) {
      setWorldStatus("Weapons need more power.", "warn");
    }
  }

  function hasStructuralHits(hits) {
    return hits.some((hit) => (
      hit.destroyedPart ||
      hit.destroyedCore ||
      hit.destroyedPlayerCore ||
      hit.shieldDestroyed ||
      hit.traderHostile
    ));
  }

  function hostMultiplayer() {
    if (state.mode !== "world") {
      enterWorld();
    }

    connectMultiplayer({ asHost: true, createRoom: true });
  }

  function joinMultiplayer() {
    if (state.mode !== "world") {
      enterWorld({ collectPieces: false });
    }

    connectMultiplayer({ asHost: false });
  }

  function connectMultiplayer({ asHost, roomId = null, createRoom = false }) {
    leaveMultiplayer(false);
    const connectionToken = multiplayerConnectionToken + 1;
    const normalizedRoomId = normalizeRoomCode(roomId);
    multiplayerConnectionToken = connectionToken;
    state.multiplayer.role = asHost ? "host" : "guest";
    state.multiplayer.isHost = false;
    state.multiplayer.hostId = null;
    state.multiplayer.roomId = normalizedRoomId || null;
    state.multiplayer.connected = false;
    state.multiplayer.peerCount = 0;
    state.multiplayer.worldSynced = asHost;
    state.multiplayer.sharedWorldRenderKey = getSharedWorldRenderKey(state.world);
    state.multiplayer.lastWorldStateAt = 0;

    if (!asHost) {
      clearSharedWorldState(state.world);
      state.multiplayer.sharedWorldRenderKey = getSharedWorldRenderKey(state.world);
      renderWorldOnly();
    }

    syncMultiplayerControls();
    setWorldStatus(getConnectingMessage({ asHost, createRoom, roomId: normalizedRoomId }), "");

    multiplayerClient = createMultiplayerClient({
      onOpen: () => {
        if (connectionToken !== multiplayerConnectionToken) {
          return;
        }

        state.multiplayer.connected = true;
        multiplayerClient.send(getMultiplayerStartMessage({ asHost, createRoom, roomId: normalizedRoomId }));
        syncMultiplayerControls();
      },
      onClose: () => {
        if (connectionToken !== multiplayerConnectionToken) {
          return;
        }

        multiplayerClient = null;
        state.multiplayer.connected = false;
        state.multiplayer.clientId = null;
        state.multiplayer.hostId = null;
        state.multiplayer.roomId = null;
        state.multiplayer.role = "solo";
        state.multiplayer.isHost = false;
        state.multiplayer.peerCount = 0;
        state.multiplayer.worldSynced = false;
        state.multiplayer.sharedWorldRenderKey = "";
        state.multiplayer.remotePlayers.clear();
        state.pendingTradeSlots.clear();
        syncMultiplayerControls();
        setWorldStatus("Multiplayer disconnected.", "warn");
        renderWorldOnly();
      },
      onMessage: (message) => {
        if (connectionToken === multiplayerConnectionToken) {
          handleMultiplayerMessage(message);
        }
      },
    });

    multiplayerClient.connect();
  }

  function getConnectingMessage({ asHost, createRoom, roomId }) {
    if (createRoom) {
      return "Creating private room...";
    }

    if (roomId) {
      return `Joining private room ${roomId}...`;
    }

    return asHost ? "Creating shared map..." : "Connecting to shared map...";
  }

  function getMultiplayerStartMessage({ asHost, createRoom, roomId }) {
    if (createRoom) {
      return { type: "create-room" };
    }

    if (!asHost && roomId) {
      return { type: "join-room", roomId };
    }

    if (asHost) {
      return roomId ? { type: "host-start", roomId } : { type: "host-start" };
    }

    return { type: "join" };
  }

  function getHostedStatusMessage() {
    return state.multiplayer.roomId && state.multiplayer.roomId !== "PUBLIC"
      ? `Hosting private room ${state.multiplayer.roomId}.`
      : "Hosting shared map.";
  }

  function getJoinedStatusMessage() {
    const roomText = state.multiplayer.roomId && state.multiplayer.roomId !== "PUBLIC"
      ? `private room ${state.multiplayer.roomId}`
      : "shared map";

    return state.multiplayer.worldSynced
      ? `Connected to ${roomText}.`
      : `Connected to ${roomText}. Waiting for host map.`;
  }

  function leaveMultiplayer(showStatus = true) {
    multiplayerConnectionToken += 1;

    if (multiplayerClient) {
      const client = multiplayerClient;
      multiplayerClient = null;
      client.close();
    }

    state.multiplayer.connected = false;
    state.multiplayer.clientId = null;
    state.multiplayer.hostId = null;
    state.multiplayer.roomId = null;
    state.multiplayer.role = "solo";
    state.multiplayer.isHost = false;
    state.multiplayer.peerCount = 0;
    state.multiplayer.worldSynced = false;
    state.multiplayer.sharedWorldRenderKey = "";
    state.multiplayer.remotePlayers.clear();
    state.pendingTradeSlots.clear();
    syncMultiplayerControls();
    renderWorldOnly();

    if (showStatus) {
      setWorldStatus("Left multiplayer.", "warn");
    }
  }

  function handleMultiplayerMessage(message) {
    if (message.type === "welcome") {
      state.multiplayer.clientId = message.id;
      syncMultiplayerControls();
      return;
    }

    if (message.type === "hosted") {
      state.multiplayer.connected = true;
      state.multiplayer.clientId = message.id;
      state.multiplayer.hostId = message.id;
      state.multiplayer.roomId = message.roomId ?? state.multiplayer.roomId;
      state.multiplayer.isHost = true;
      state.multiplayer.role = "host";
      state.multiplayer.worldSynced = true;
      state.multiplayer.sharedWorldRenderKey = getSharedWorldRenderKey(state.world);
      setWorldStatus(getHostedStatusMessage(), "good");
      syncMultiplayerControls();
      sendSharedWorldSnapshot(performance.now(), true);
      return;
    }

    if (message.type === "joined") {
      state.multiplayer.connected = true;
      state.multiplayer.clientId = message.id;
      state.multiplayer.hostId = message.hostId ?? null;
      state.multiplayer.roomId = message.roomId ?? state.multiplayer.roomId;
      state.multiplayer.isHost = state.multiplayer.hostId === state.multiplayer.clientId && state.multiplayer.role === "host";
      state.multiplayer.role = state.multiplayer.isHost ? "host" : "guest";
      state.multiplayer.worldSynced = state.multiplayer.isHost;
      setRemotePlayers(message.players ?? [], false);

      if (!state.multiplayer.isHost && message.worldState) {
        applySharedWorldSnapshot(state.world, message.worldState);
        state.multiplayer.worldSynced = true;
        state.multiplayer.sharedWorldRenderKey = getSharedWorldRenderKey(state.world);
      }

      if (state.multiplayer.isHost) {
        setWorldStatus(getHostedStatusMessage(), "good");
      } else if (state.multiplayer.hostId) {
        setWorldStatus(
          getJoinedStatusMessage(),
          state.multiplayer.worldSynced ? "good" : "warn",
        );
      } else {
        setWorldStatus("Connected. No shared map host yet.", "warn");
      }

      syncMultiplayerControls();
      renderWorldOnly();
      sendMultiplayerSnapshot(performance.now(), true);
      sendSharedWorldSnapshot(performance.now(), true);
      startWorldLoop();
      return;
    }

    if (message.type === "peer-count") {
      if (message.roomId && state.multiplayer.roomId && message.roomId !== state.multiplayer.roomId) {
        return;
      }

      state.multiplayer.peerCount = message.count ?? 0;
      syncMultiplayerControls();
      return;
    }

    if (message.type === "player-state") {
      upsertRemotePlayer(message.playerId, message.state);
      return;
    }

    if (message.type === "player-left") {
      state.multiplayer.remotePlayers.delete(message.id);
      scheduleWorldRender();
      return;
    }

    if (message.type === "world-state") {
      if (!isMultiplayerHost()) {
        state.multiplayer.hostId = message.hostId ?? state.multiplayer.hostId;
        state.multiplayer.roomId = message.roomId ?? state.multiplayer.roomId;
        const previousRenderKey = state.multiplayer.sharedWorldRenderKey;
        applySharedWorldSnapshot(state.world, message.worldState);
        state.multiplayer.worldSynced = true;
        state.multiplayer.sharedWorldRenderKey = getSharedWorldRenderKey(state.world);

        if (previousRenderKey !== state.multiplayer.sharedWorldRenderKey) {
          scheduleWorldRender();
        }

        startWorldLoop();
      }
      return;
    }

    if (message.type === "host-left") {
      if (!isMultiplayerHost()) {
        state.multiplayer.hostId = null;
        state.multiplayer.roomId = null;
        state.multiplayer.connected = false;
        state.multiplayer.role = "solo";
        state.multiplayer.isHost = false;
        state.multiplayer.peerCount = 0;
        state.multiplayer.worldSynced = false;
        clearSharedWorldState(state.world);
        state.multiplayer.sharedWorldRenderKey = getSharedWorldRenderKey(state.world);
        state.tradeMenuOpen = false;
        state.activeTraderId = null;
        state.pendingTradeSlots.clear();
        setWorldStatus("Host left. Shared map paused.", "warn");
        syncMultiplayerControls();
        scheduleWorldRender();
      }
      return;
    }

    if (message.type === "grant-pieces") {
      applyPieceGrant(message.pieces, message.scrap ?? 0);
      return;
    }

    if (message.type === "damage-player") {
      applyIncomingPlayerDamage(message.damage, message.attackerId);
      return;
    }

    if (message.type === "trade-buy-request") {
      handleTradeBuyRequest(message);
      return;
    }

    if (message.type === "trade-buy-result") {
      applyTradeBuyResult(message);
      return;
    }

    if (message.type === "trade-refresh-request") {
      handleTradeRefreshRequest(message);
      return;
    }

    if (message.type === "trade-refresh-result") {
      applyTradeRefreshResult(message);
      return;
    }

    if (message.type === "trade-sell-request") {
      handleTradeSellRequest(message);
      return;
    }

    if (message.type === "trade-sell-result") {
      applyTradeSellResult(message);
      return;
    }

    if (message.type === "error") {
      const messageText = message.message ?? "Multiplayer error.";

      if (messageText.includes("Private room")) {
        leaveMultiplayer(false);
        setWorldStatus(messageText, "bad");
        return;
      }

      if (state.multiplayer.role === "host" && !state.multiplayer.isHost) {
        state.multiplayer.role = state.multiplayer.hostId ? "guest" : "solo";
      }

      setWorldStatus(messageText, "bad");
    }
  }

  function setRemotePlayers(players, shouldRender = true) {
    state.multiplayer.remotePlayers.clear();

    for (const player of players) {
      upsertRemotePlayer(player.id, player.state, false);
    }

    if (shouldRender) {
      scheduleWorldRender();
    }
  }

  function upsertRemotePlayer(playerId, playerState, shouldRender = true) {
    if (!playerId || !playerState || playerId === state.multiplayer.clientId) {
      return;
    }

    const previousPlayer = state.multiplayer.remotePlayers.get(playerId);
    const renderKey = getRemotePlayerRenderKey(playerState);

    state.multiplayer.remotePlayers.set(playerId, {
      id: playerId,
      ...playerState,
      renderKey,
    });

    if (shouldRender && state.mode === "world" && (!previousPlayer || previousPlayer.renderKey !== renderKey)) {
      scheduleWorldRender();
    }
  }

  function getRemotePlayerRenderKey(playerState) {
    return JSON.stringify((playerState.board ?? []).flatMap((row) => (
      row
        .filter((cell) => cell.base || cell.block || cell.underlay)
        .map((cell) => [
          cell.x,
          cell.y,
          cell.base?.id ?? "",
          Math.round(cell.base?.hp ?? -1),
          cell.block?.id ?? "",
          Math.round(cell.block?.hp ?? -1),
          cell.underlay?.id ?? "",
          Math.round(cell.underlay?.hp ?? -1),
        ])
    )));
  }

  function getSharedWorldRenderKey(world) {
    const enemies = getWorldEnemies(world);
    const traders = Array.isArray(world.traders) ? world.traders : [];

    return JSON.stringify({
      enemies: enemies.map((enemy) => ({
        id: enemy.id ?? "",
        dead: Boolean(enemy.dead),
        zone: enemy.zone ?? "",
        cells: (enemy.cells ?? []).map((cell) => [
          cell.x,
          cell.y,
          cell.base?.id ?? "",
          Math.round(cell.base?.hp ?? -1),
          cell.block?.id ?? "",
          Math.round(cell.block?.hp ?? -1),
          cell.underlay?.id ?? "",
          Math.round(cell.underlay?.hp ?? -1),
        ]),
      })),
      traders: traders.map((trader) => ({
        id: trader.id ?? "",
        dead: Boolean(trader.dead),
        hostileToPlayer: Boolean(trader.hostileToPlayer),
        stock: (trader.stock ?? []).map((item) => [
          item?.kind ?? "part",
          item?.tileId ?? item?.name ?? "",
          item?.quantity ?? 0,
          item?.scrap ?? 0,
        ]),
        cells: (trader.cells ?? []).map((cell) => [
          cell.x,
          cell.y,
          cell.base?.id ?? "",
          Math.round(cell.base?.hp ?? -1),
          cell.block?.id ?? "",
          Math.round(cell.block?.hp ?? -1),
          cell.underlay?.id ?? "",
          Math.round(cell.underlay?.hp ?? -1),
        ]),
      })),
      pieces: (world.pieces ?? []).map((piece) => [
        piece.id,
        piece.tileId,
        Boolean(piece.collected),
        Boolean(piece.destroyed),
        Boolean(piece.connectedToCore),
        Math.round(piece.hp ?? -1),
      ]),
    });
  }

  function getRemoteShips() {
    return [...state.multiplayer.remotePlayers.values()];
  }

  function getWorldEnemies(world = state.world) {
    if (Array.isArray(world.enemies)) {
      return world.enemies;
    }

    return world.enemy ? [world.enemy] : [];
  }

  function getLiveWorldEnemies(world = state.world) {
    return getWorldEnemies(world).filter((enemy) => enemy && !enemy.dead);
  }

  function collectRemotePlayerPieces() {
    if (!isMultiplayerHost() || !multiplayerClient?.isOpen()) {
      return { collected: [], scrapCollected: 0 };
    }

    const collected = [];
    let scrapCollected = 0;

    for (const player of getRemoteShips()) {
      if (!player?.body || !player?.board) {
        continue;
      }

      const collection = collectNearbyPiecesForShip(state.world, player.board, player.body);

      if (collection.collected.length === 0 && (collection.scrapCollected ?? 0) === 0) {
        continue;
      }

      collected.push(...collection.collected);
      scrapCollected += collection.scrapCollected ?? 0;
      multiplayerClient.send({
        type: "grant-pieces",
        targetId: player.id,
        pieces: countPiecesByTile(collection.collected),
        scrap: collection.scrapCollected ?? 0,
      });
    }

    return { collected, scrapCollected };
  }

  function applyPieceGrant(pieces, scrap = 0) {
    const entries = Object.entries(pieces ?? {}).filter(([, count]) => count > 0);
    const scrapAmount = Math.max(0, Number(scrap) || 0);

    if (entries.length === 0 && scrapAmount === 0) {
      return;
    }

    let total = 0;

    for (const [tileId, count] of entries) {
      state.inventory[tileId] = (state.inventory[tileId] ?? 0) + count;
      total += count;
    }

    applyScrapReward(scrapAmount);
    setWorldStatus(getCollectionMessage(total, "Pieces collected.", scrapAmount), "good");
    renderAll();
  }

  function countPiecesByTile(pieces) {
    return pieces.reduce((counts, piece) => {
      if (piece.tileId === "scrap") {
        return counts;
      }

      counts[piece.tileId] = (counts[piece.tileId] ?? 0) + 1;
      return counts;
    }, {});
  }

  function sendRemoteDamageEvents(hits) {
    if (!isMultiplayerConnected() || !multiplayerClient?.isOpen()) {
      return;
    }

    for (const hit of hits) {
      if (!hit.remotePlayerId) {
        continue;
      }

      multiplayerClient.send({
        type: "damage-player",
        targetId: hit.remotePlayerId,
        damage: {
          cellKey: hit.remoteCellKey,
          layer: hit.remoteLayer,
          amount: hit.damage,
          partName: hit.partName,
        },
      });
    }
  }

  function applyIncomingPlayerDamage(damage, attackerId) {
    const [x, y] = String(damage?.cellKey ?? "").split(",").map(Number);
    const cell = Number.isFinite(x) && Number.isFinite(y) ? getCell(state.board, x, y) : null;
    const tile = cell?.[damage?.layer];

    if (!tile || typeof damage?.amount !== "number") {
      return;
    }

    ensureTileHealth(tile);
    const shieldResult = absorbDamageWithNearbyShield(state.board, cell, damage.amount);
    tile.hp = Math.max(0, tile.hp - shieldResult.damage);

    if (tile.hp <= 0) {
      destroyOwnShipTile(cell, damage.layer);
      pruneMissingSelections();
      setWorldStatus(
        tile.id === "core"
          ? `Your core was destroyed by Player ${attackerId}.`
          : `Player ${attackerId} destroyed your ${formatTileName(tile.id)}.`,
        "bad",
      );
    } else if (shieldResult.shieldDestroyed) {
      setWorldStatus(`Shield overloaded absorbing Player ${attackerId}'s shot.`, "warn");
    } else if (shieldResult.absorbed > 0) {
      const absorbed = Math.round(shieldResult.absorbed);
      setWorldStatus(`Shield absorbed ${absorbed} damage from Player ${attackerId}.`, "warn");
    } else {
      setWorldStatus(`Player ${attackerId} hit your ${formatTileName(tile.id)}.`, "warn");
    }

    renderAll();
    sendMultiplayerSnapshot(performance.now(), true);
  }

  function destroyOwnShipTile(cell, layer) {
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

  function sendMultiplayerSnapshot(timestamp, force = false) {
    if (!isMultiplayerConnected() || !multiplayerClient?.isOpen()) {
      return;
    }

    if (!force && timestamp - state.multiplayer.lastSnapshotAt < MULTIPLAYER_SNAPSHOT_INTERVAL * 1000) {
      return;
    }

    state.multiplayer.lastSnapshotAt = timestamp;
    multiplayerClient.send({
      type: "player-state",
      state: createMultiplayerSnapshot(),
    });
  }

  function sendSharedWorldSnapshot(timestamp, force = false) {
    if (!isMultiplayerHost() || !multiplayerClient?.isOpen()) {
      return;
    }

    if (!force && timestamp - state.multiplayer.lastWorldStateAt < MULTIPLAYER_WORLD_STATE_INTERVAL * 1000) {
      return;
    }

    state.multiplayer.lastWorldStateAt = timestamp;
    multiplayerClient.send({
      type: "world-state",
      worldState: createSharedWorldSnapshot(state.world),
    });
  }

  function createMultiplayerSnapshot() {
    return {
      body: { ...state.world.ship },
      board: state.board,
      activeEngineIds: [...state.activeEngineIds],
    };
  }

  function isMultiplayerConnected() {
    return state.multiplayer.connected;
  }

  function isMultiplayerHost() {
    return isMultiplayerConnected() && state.multiplayer.isHost;
  }

  function shouldSimulateSharedWorld() {
    if (!isMultiplayerConnected()) {
      return state.multiplayer.role !== "guest";
    }

    return state.multiplayer.isHost || state.multiplayer.role === "solo";
  }

  function startWorldLoop() {
    if (worldAnimationId) {
      return;
    }

    lastWorldFrame = performance.now();
    worldAnimationId = requestAnimationFrame(runWorldFrame);
  }

  function stopWorldLoop() {
    if (!worldAnimationId) {
      return;
    }

    cancelAnimationFrame(worldAnimationId);
    worldAnimationId = null;
  }

  function runWorldFrame(timestamp) {
    if (state.mode !== "world") {
      worldAnimationId = null;
      cancelScheduledWorldRender();
      return;
    }

    const deltaSeconds = Math.max(0, (timestamp - lastWorldFrame) / 1000);
    lastWorldFrame = timestamp;
    calculatePower(state.board, state.unlockedTechIds);

    const collection = stepWorld(
      state.world,
      state.board,
      state.activeEngineIds,
      state.inventory,
      deltaSeconds,
      getRemoteShips(),
      {
        collectPieces: shouldSimulateSharedWorld(),
        includeWorldTargets: shouldSimulateSharedWorld(),
        simulatePve: shouldSimulateSharedWorld(),
        techIds: state.unlockedTechIds,
        updateProjectiles: shouldSimulateSharedWorld(),
      },
    );
    const remoteCollection = collectRemotePlayerPieces();
    const weaponAction = fireQueuedWeaponOrders();
    sendRemoteDamageEvents(collection.hits);
    sendRemoteDamageEvents(weaponAction.hits);
    const collectionScrap = (collection.scrapCollected ?? 0) + getScrapFromHits(collection.hits);
    const partCollectionCount = getCollectedPartCount(collection);
    const remotePartCollectionCount = getCollectedPartCount(remoteCollection);
    applyScrapReward(collectionScrap);
    const hits = [
      ...collection.hits,
      ...weaponAction.hits,
    ];

    if (hits.length > 0) {
      const coreHit = hits.find((hit) => hit.destroyedCore);
      setWorldStatus(
        coreHit ? getCoreDestroyedMessage(coreHit) : getHitMessage(hits[0]),
        "good",
      );
      if (hasStructuralHits(hits)) {
        renderWorldOnly();
      }
    } else if (weaponAction.fired > 0) {
      handleWeaponFireResult(weaponAction, false);
    } else if (
      partCollectionCount > 0 ||
      collectionScrap > 0 ||
      remotePartCollectionCount > 0 ||
      (remoteCollection.scrapCollected ?? 0) > 0
    ) {
      setWorldStatus(getCollectionMessage(partCollectionCount, "Pieces collected.", collectionScrap), "good");
      renderInventory({
        container: dom.worldInventoryList,
        tiles: TILES,
        inventory: state.inventory,
      });
      dom.worldScrapValue.textContent = state.scrap;
    } else if (collection.worldChanged) {
      renderWorldOnly();
    }

    pruneMissingSelections();
    updateWorldDynamicView();
    sendMultiplayerSnapshot(timestamp);
    sendSharedWorldSnapshot(
      timestamp,
      collection.worldChanged ||
        remoteCollection.collected.length > 0 ||
        (remoteCollection.scrapCollected ?? 0) > 0 ||
        collection.collected.length > 0 ||
        collectionScrap > 0 ||
        hits.length > 0,
    );

    if (!shouldContinueWorldLoop()) {
      worldAnimationId = null;
      return;
    }

    worldAnimationId = requestAnimationFrame(runWorldFrame);
  }

  function fireQueuedWeaponOrders() {
    const combined = createEmptyWeaponResult();

    if (state.weaponOrder?.target && state.weaponOrder.weaponIds.length > 0) {
      state.weaponOrder.weaponIds = getLiveWeaponIds(state.weaponOrder.weaponIds);

      if (state.weaponOrder.weaponIds.length === 0) {
        clearWeaponOrder();
        return combined;
      }

      mergeWeaponResult(combined, fireWeaponIdsAtTarget(state.weaponOrder.weaponIds, state.weaponOrder.target));
    }

    return combined;
  }

  function createEmptyWeaponResult() {
    return {
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
  }

  function mergeWeaponResult(target, source) {
    target.blocked += source.blocked;
    target.destroyedCore ||= source.destroyedCore;
    target.fired += source.fired;
    target.coolingDown += source.coolingDown;
    target.noAmmo += source.noAmmo;
    target.noPower += source.noPower ?? 0;
    target.released += source.released;
    target.scrapCollected += source.scrapCollected ?? 0;
    target.hits.push(...source.hits);
    target.collected.push(...source.collected);
    return target;
  }

  function shouldContinueWorldLoop() {
    const liveEnemies = getLiveWorldEnemies();
    const enemyMotionActive = liveEnemies.some((enemy) => (
      Math.hypot(enemy.body.vx, enemy.body.vy) > 1 ||
      Math.abs(enemy.body.angularVelocity) > 0.01
    ));

    return (
      liveEnemies.length > 0 ||
      shouldSimulateSharedWorld() ||
      state.activeEngineIds.size > 0 ||
      Boolean(state.weaponOrder?.target && state.weaponOrder.weaponIds.length > 0) ||
      isMultiplayerConnected() ||
      hasAmmoActivity(state.board) ||
      hasWeaponCooldowns(state.board) ||
      hasRepairBotActivity(state.world, state.board, state.activeEngineIds) ||
      hasShieldRegenActivity(state.board) ||
      state.world.weaponEffects.length > 0 ||
      state.world.projectiles.length > 0 ||
      Math.hypot(state.world.ship.vx, state.world.ship.vy) > 1 ||
      Math.abs(state.world.ship.angularVelocity) > 0.01 ||
      enemyMotionActive
    );
  }

  function pruneMissingSelections() {
    const engineIds = new Set(getBoardEngineParts(state.board).map((engine) => engine.key));
    const weaponIds = new Set(getBoardWeaponParts(state.board).map((weapon) => weapon.key));

    for (const engineId of state.selectedEngineIds) {
      if (!engineIds.has(engineId)) {
        state.selectedEngineIds.delete(engineId);
      }
    }

    for (const engineId of state.activeEngineIds) {
      if (!engineIds.has(engineId)) {
        state.activeEngineIds.delete(engineId);
      }
    }

    for (const weaponId of state.selectedWeaponIds) {
      if (!weaponIds.has(weaponId)) {
        state.selectedWeaponIds.delete(weaponId);
      }
    }

    if (state.weaponOrder) {
      state.weaponOrder.weaponIds = state.weaponOrder.weaponIds.filter((weaponId) => weaponIds.has(weaponId));

      if (state.weaponOrder.weaponIds.length === 0) {
        clearWeaponOrder();
      }
    }

    pruneControlGroups(engineIds, weaponIds);
  }

  function pruneControlGroups(engineIds, weaponIds) {
    for (const [groupKey, group] of Object.entries(state.controlGroups)) {
      group.engines = group.engines.filter((engineId) => engineIds.has(engineId));
      group.weapons = group.weapons.filter((weaponId) => weaponIds.has(weaponId));

      if (group.engines.length === 0 && group.weapons.length === 0) {
        delete state.controlGroups[groupKey];
      }
    }
  }

  function applyScrapReward(amount) {
    const scrapAmount = Math.max(0, Number(amount) || 0);

    if (scrapAmount > 0) {
      state.scrap += getModifiedScrapReward(scrapAmount);
    }
  }

  function getModifiedScrapReward(amount) {
    let bonus = 1;

    if (state.unlockedTechIds.has("salvage-sorting")) {
      bonus += 0.15;
    }

    if (state.unlockedTechIds.has("depot-grids")) {
      bonus += 0.1;
    }

    return Math.ceil(amount * bonus);
  }

  function getScrapFromHits(hits) {
    return hits.reduce((total, hit) => total + (hit.scrapCollected ?? 0), 0);
  }

  function getCollectedPartCount(collection) {
    return (collection.collected ?? []).filter((piece) => piece.tileId !== "scrap").length;
  }

  function getCollectionMessage(count, fallback, scrap = 0) {
    const parts = [];

    if (count === 1) {
      parts.push("1 piece");
    } else if (count > 1) {
      parts.push(`${count} pieces`);
    }

    if (scrap > 0) {
      parts.push(`${scrap} scrap`);
    }

    if (parts.length > 0) {
      return `${parts.join(" and ")} collected.`;
    }

    return fallback;
  }

  function getHitMessage(hit) {
    if (hit.traderHostile) {
      return `${hit.traderName ?? "Trader"} is now hostile.`;
    }

    if (hit.shieldProjectileIntercepted) {
      if (hit.shieldDestroyed) {
        return "Shield collapsed blocking a projectile.";
      }

      return `Shield blocked a projectile and lost ${Math.round(hit.shieldDamage ?? 0)} HP.`;
    }

    if (hit.shieldBeamIntercepted) {
      if (hit.shieldDestroyed) {
        return "Shield collapsed diffusing a laser.";
      }

      return `Shield diffused a laser and lost ${Math.round(hit.shieldDamage ?? 0)} HP.`;
    }

    if (hit.destroyedPart) {
      return `Destroyed ${hit.partName}.`;
    }

    if (hit.shieldDestroyed) {
      return `Shield overloaded protecting ${hit.partName}.`;
    }

    if (hit.shieldAbsorbed > 0) {
      return `Shield absorbed ${Math.round(hit.shieldAbsorbed)} damage from ${hit.partName}.`;
    }

    return `Hit ${hit.partName}.`;
  }

  function getCoreDestroyedMessage(hit) {
    if (hit.destroyedPlayerCore) {
      return "Your core was destroyed.";
    }

    const scrapText = hit.scrapCollected > 0 ? ` ${hit.scrapCollected} scrap collected.` : "";
    return `Core destroyed. ${hit.released} pieces released.${scrapText}`;
  }

  function formatTileName(tileId) {
    return String(tileId)
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function setWorldStatus(message, type = "") {
    setStatus({ statusElement: dom.worldStatus }, message, type);
  }

  function setActiveFilter(filter, activeTab) {
    state.activeFilter = filter;
    dom.tabs.forEach((tab) => tab.classList.toggle("active", tab === activeTab));
    renderAll();
  }

  function onHoverCell(x, y, cellElement) {
    clearHoverPreview();
    state.hoverCell = { x, y };
    state.hoverElement = cellElement;

    const preview = validateCell(x, y);
    cellElement.classList.add(preview.ok ? "valid-preview" : "invalid-preview");
    setStatus(dom, preview.message, preview.ok ? "" : "bad");
  }

  function onLeaveCell(cellElement) {
    clearHoverPreview(cellElement);
    state.hoverCell = null;
    state.hoverElement = null;
  }

  function clearHoverPreview(element = state.hoverElement) {
    if (!element) {
      return;
    }

    element.classList.remove("valid-preview", "invalid-preview");
  }

  function renderBoardOnly() {
    renderBoard({
      dom,
      board: state.board,
      hoverCell: state.hoverCell,
      validateCell,
      onHoverCell,
      onLeaveCell,
      onPlaceCell: placeTile,
    });
    centerConstructionCoreIfNeeded();
  }

  function renderAll() {
    calculatePower(state.board, state.unlockedTechIds);
    renderConstruction();
    renderWorldOnly();
    dom.eraseButton.classList.toggle("active", state.eraseMode);
  }

  function renderConstruction() {
    if (state.mode !== "construction") {
      return;
    }

    renderPalette({
      dom,
      tiles: TILES,
      activeFilter: state.activeFilter,
      selectedTileId: state.selectedTileId,
      eraseMode: state.eraseMode,
      directionIndex: state.directionIndex,
      inventory: state.inventory,
      unlockedTechIds: state.unlockedTechIds,
      onSelectTile: selectTile,
    });
    renderBoardOnly();
    renderInspector({
      dom,
      tile: getSelectedTile(),
      directionIndex: state.directionIndex,
      eraseMode: state.eraseMode,
      inventory: state.inventory,
      unlockedTechIds: state.unlockedTechIds,
    });
    renderTechTree({
      dom,
      tiles: TILES,
      projects: RESEARCH_PROJECTS,
      scrap: state.scrap,
      inventory: state.inventory,
      unlockedTechIds: state.unlockedTechIds,
      isOpen: state.techTreeOpen,
      activeSection: state.activeTechSection,
      selectedProjectId: state.selectedTechProjectId,
      onSelectSection: selectTechSection,
      onSelectProject: selectTechProject,
      onCloseProject: closeTechProject,
      onResearch: researchProject,
    });
    renderStats({
      dom,
      stats: getStats(state.board, state.unlockedTechIds),
      scrap: state.scrap,
    });
  }

  function renderWorldOnly() {
    renderInventory({
      container: dom.worldInventoryList,
      tiles: TILES,
      inventory: state.inventory,
    });
    renderWorld({
      dom,
      world: state.world,
      board: state.board,
      tiles: TILES,
      scrap: state.scrap,
      inventory: state.inventory,
      worldStats: getWorldStats(state.world, state.board, state.activeEngineIds),
      worldZoom: state.worldZoom,
      selectedEngineIds: state.selectedEngineIds,
      activeEngineIds: state.activeEngineIds,
      selectedWeaponIds: state.selectedWeaponIds,
      weaponTarget: state.weaponOrder?.target ?? null,
      remotePlayers: getRemoteShips(),
      onSelectEngine: toggleEngineSelection,
      onSelectWeapon: toggleWeaponSelection,
      onTargetPoint: fireAtWorldTarget,
    });
    renderActiveTradeMenu();
    syncWorldControls();
  }

  function updateWorldDynamicView() {
    dom.worldScrapValue.textContent = state.scrap;
    updateWorldMotion({
      dom,
      world: state.world,
      board: state.board,
      tiles: TILES,
      inventory: state.inventory,
      worldStats: getWorldStats(state.world, state.board, state.activeEngineIds),
      worldZoom: state.worldZoom,
      remotePlayers: getRemoteShips(),
      onTargetPoint: fireAtWorldTarget,
    });
    renderActiveTradeMenu();
    syncWorldControls();
  }

  function renderActiveTradeMenu() {
    const activeTrader = getActiveTrader();
    renderTradeMenu({
      dom,
      tiles: TILES,
      inventory: state.inventory,
      scrap: state.scrap,
      trader: activeTrader,
      isOpen: state.tradeMenuOpen,
      canTrade: canTradeWithTrader(activeTrader),
      unlockedTechIds: state.unlockedTechIds,
      pendingSlotIndexes: getPendingTradeSlotIndexes(activeTrader?.id),
      refreshCost: TRADER_REFRESH_COST,
      refreshPending: state.pendingTradeSlots.has(getTradeActionKey(activeTrader?.id, "refresh")),
      onBuySlot: buyTradeSlot,
      onSellItem: sellTradeItem,
      getSellPrice: getTraderSellPrice,
    });
  }

  function refreshWeaponTargetMarker() {
    const worldSpace = dom.worldMap.querySelector(".world-space");

    if (!worldSpace) {
      return;
    }

    worldSpace.querySelectorAll(".weapon-target-marker").forEach((marker) => marker.remove());

    if (!state.weaponOrder?.target) {
      return;
    }

    const marker = document.createElement("span");
    marker.className = "weapon-target-marker";
    marker.style.left = `${state.weaponOrder.target.x}px`;
    marker.style.top = `${state.weaponOrder.target.y}px`;
    worldSpace.append(marker);
  }

  function scheduleWorldRender() {
    if (state.mode !== "world" || scheduledWorldRenderId) {
      return;
    }

    scheduledWorldRenderId = requestAnimationFrame(() => {
      scheduledWorldRenderId = null;

      if (state.mode === "world") {
        renderWorldOnly();
      }
    });
  }

  function cancelScheduledWorldRender() {
    if (!scheduledWorldRenderId) {
      return;
    }

    cancelAnimationFrame(scheduledWorldRenderId);
    scheduledWorldRenderId = null;
  }

  function centerConstructionCoreIfNeeded() {
    if (!state.centerConstructionOnNextRender) {
      return;
    }

    state.centerConstructionOnNextRender = false;
    requestAnimationFrame(() => {
      dom.boardElement.querySelector(".core-cell")?.scrollIntoView({
        block: "center",
        inline: "center",
      });
    });
  }

  function syncWorldControls() {
    syncZoomButtons();
    syncBuildButton();
    syncTradeButton();
    syncMultiplayerControls();
  }

  function syncZoomButtons() {
    dom.zoomOutButton.disabled = state.worldZoom <= WORLD_ZOOM_MIN + 0.001;
    dom.zoomInButton.disabled = state.worldZoom >= WORLD_ZOOM_MAX - 0.001;
  }

  function syncBuildButton() {
    const locked = isEnemyShipNearby(state.world);
    dom.buildButton.disabled = locked;
    dom.buildButton.title = locked
      ? `Enemy ship nearby (${Math.round(getEnemyDistance(state.world))}/${BUILD_LOCKOUT_DISTANCE}).`
      : "Open ship construction";
  }

  function syncTradeButton() {
    const tradeInfo = state.mode === "world" ? getNearestTraderInRange(state.world) : null;
    const trader = tradeInfo?.trader ?? null;
    dom.tradeButton.classList.toggle("hidden", !trader || state.tradeMenuOpen);
    dom.tradeButton.disabled = !trader;
    dom.tradeButton.title = trader
      ? `Trade with ${trader.name ?? "Trader"}`
      : "Enter a friendly trader's yellow radius";
  }

  function syncMultiplayerControls() {
    const privateRoomCode = getPrivateRoomCode();
    dom.multiplayerTitle.textContent = privateRoomCode ?? "Multiplayer";
    dom.multiplayerTitle.classList.toggle("room-code-title", Boolean(privateRoomCode));
    dom.multiplayerStatus.textContent = state.multiplayer.connected
      ? getMultiplayerStatusLabel()
      : "Solo";
    dom.multiplayerCount.textContent = `${state.multiplayer.peerCount} connected`;
    if (state.multiplayer.connected && state.multiplayer.roomId) {
      dom.shareUrl.textContent = state.multiplayer.roomId === "PUBLIC"
        ? "Public room"
        : state.multiplayer.roomId;
    } else {
      dom.shareUrl.textContent = defaultShareUrlText;
    }
    dom.hostButton.disabled = state.multiplayer.connected;
    dom.joinButton.disabled = state.multiplayer.connected;
    dom.leaveButton.disabled = !state.multiplayer.connected;
  }

  function getMultiplayerStatusLabel() {
    if (state.multiplayer.isHost) {
      return state.multiplayer.roomId && state.multiplayer.roomId !== "PUBLIC"
        ? `Hosting ${state.multiplayer.roomId}`
        : "Hosting";
    }

    return state.multiplayer.roomId && state.multiplayer.roomId !== "PUBLIC"
      ? `Joined ${state.multiplayer.roomId}`
      : "Connected";
  }

  function getPrivateRoomCode() {
    return state.multiplayer.connected && state.multiplayer.roomId && state.multiplayer.roomId !== "PUBLIC"
      ? state.multiplayer.roomId
      : null;
  }

  async function loadShareUrl() {
    try {
      const response = await fetch("./server-info.json", { cache: "no-store" });
      const info = await response.json();
      if (state.multiplayer.connected && state.multiplayer.roomId) {
        return;
      }
      const isLocalHost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
      const shareUrl = isLocalHost
        ? info.lanUrls?.[0] ?? info.localUrl ?? window.location.origin
        : window.location.origin;

      defaultShareUrlText = shareUrl;
      dom.shareUrl.textContent = defaultShareUrlText;
    } catch (error) {
      defaultShareUrlText = window.location.origin;
      dom.shareUrl.textContent = defaultShareUrlText;
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function screenToWorldPoint(screenPoint) {
    const rect = dom.worldMap.getBoundingClientRect();
    const zoom = state.worldZoom || 1;
    const offsetX = (screenPoint.x - rect.width / 2) / zoom;
    const offsetY = (screenPoint.y - rect.height / 2) / zoom;
    const cos = Math.cos(state.world.ship.angle);
    const sin = Math.sin(state.world.ship.angle);

    return {
      x: state.world.ship.x + offsetX * cos - offsetY * sin,
      y: state.world.ship.y + offsetX * sin + offsetY * cos,
    };
  }

  function getWorldPointFromMapEvent(event) {
    const rect = dom.worldMap.getBoundingClientRect();

    return screenToWorldPoint({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }

  function handleWorldMapClick(event) {
    if (state.mode !== "world") {
      return;
    }

    if (event.target.closest(".player-ship .world-ship-part.selectable")) {
      return;
    }

    if (state.selectedWeaponIds.size > 0) {
      return;
    }

    if (!event.target.closest(".world-ship-part.selectable, .enemy-ship, .remote-player-ship")) {
      clearWorldSelection("Selection cleared.", "warn", false);
    }
  }

  function handleWorldMapPointerDown(event) {
    if (state.mode !== "world" || state.selectedWeaponIds.size === 0 || event.button !== 0) {
      return;
    }

    if (event.target.closest(".player-ship .world-ship-part.selectable")) {
      return;
    }

    fireAtWorldTarget(getWorldPointFromMapEvent(event));
  }

  function handleKeyDown(event) {
    const key = event.key.toLowerCase();

    if (state.mode === "world") {
      if (event.key === "Escape" && state.tradeMenuOpen) {
        event.preventDefault();
        closeTradeMenu();
        return;
      }

      if (key === "g") {
        event.preventDefault();
        beginControlGroupAssignment();
        return;
      }

      if (isDigitKey(event.key)) {
        event.preventDefault();

        if (state.pendingControlGroupAssignment) {
          assignControlGroup(event.key);
        } else {
          selectControlGroup(event.key);
        }

        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearWorldSelection();
        return;
      }
    }

    if (state.mode === "construction" && state.techTreeOpen) {
      if (event.key === "Escape") {
        if (state.selectedTechProjectId) {
          closeTechProject();
          return;
        }

        closeTechTree();
      }

      return;
    }

    if (key === "r" && state.mode === "construction") {
      rotateSelection();
      return;
    }

    if (event.key === "Escape" && state.mode === "construction") {
      if (state.techTreeOpen) {
        closeTechTree();
        return;
      }

      state.eraseMode = false;
      clearHoverPreview();
      setStatus(dom, `${getSelectedTile().name} selected.`, "");
      renderAll();
    }
  }

  function isDigitKey(key) {
    return key.length === 1 && key >= "0" && key <= "9";
  }

  function initializeEntryFlow() {
    renderAll();

    if (hasCompletedTutorial()) {
      showMainMenu("Choose a mode.");
    } else {
      showTutorial(0);
    }
  }

  function hasCompletedTutorial() {
    try {
      return localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function markTutorialComplete() {
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
    } catch (error) {
      // Local storage can be unavailable in private contexts; the menu still works.
    }
  }

  function showTutorial(stepIndex = state.tutorialStepIndex) {
    stopWorldLoop();
    cancelScheduledWorldRender();
    state.mode = "tutorial";
    state.tutorialStepIndex = clamp(stepIndex, 0, TUTORIAL_STEPS.length - 1);
    showOnlyView("tutorial");
    renderTutorial();
  }

  function renderTutorial() {
    const step = TUTORIAL_STEPS[state.tutorialStepIndex] ?? TUTORIAL_STEPS[0];

    dom.tutorialTitle.textContent = step.title;
    dom.tutorialCopy.textContent = step.copy;
    dom.tutorialVisual.dataset.step = step.key;
    dom.tutorialProgress.textContent = `${state.tutorialStepIndex + 1} / ${TUTORIAL_STEPS.length}`;
    dom.tutorialBackButton.disabled = state.tutorialStepIndex === 0;
    dom.tutorialNextButton.textContent = state.tutorialStepIndex === TUTORIAL_STEPS.length - 1
      ? "Open Main Menu"
      : "Next";
    dom.tutorialPoints.innerHTML = "";

    for (const point of step.points) {
      const item = document.createElement("li");
      item.textContent = point;
      dom.tutorialPoints.append(item);
    }
  }

  function previousTutorialStep() {
    showTutorial(state.tutorialStepIndex - 1);
  }

  function nextTutorialStep() {
    if (state.tutorialStepIndex >= TUTORIAL_STEPS.length - 1) {
      completeTutorial("Tutorial complete. Choose a mode.");
      return;
    }

    showTutorial(state.tutorialStepIndex + 1);
  }

  function skipTutorial() {
    completeTutorial("Tutorial skipped. Choose a mode.");
  }

  function completeTutorial(message) {
    markTutorialComplete();
    showMainMenu(message);
  }

  function showMainMenu(message = "Choose a mode.") {
    stopWorldLoop();
    cancelScheduledWorldRender();
    state.mode = "menu";
    state.tradeMenuOpen = false;
    state.activeTraderId = null;
    state.selectedEngineIds.clear();
    state.selectedWeaponIds.clear();
    state.pendingPrivateServer = false;
    clearWeaponOrder();
    dom.privateRoomPanel.classList.add("hidden");
    showOnlyView("menu");
    dom.mainMenuStatus.textContent = message;
  }

  function startSinglePlayer(options = {}) {
    state.mode = "construction";
    state.pendingPrivateServer = Boolean(options.privateServer);
    stopWorldLoop();
    cancelScheduledWorldRender();
    state.tradeMenuOpen = false;
    state.activeTraderId = null;
    state.pendingTradeSlots.clear();
    state.centerConstructionOnNextRender = true;
    showOnlyView("construction");
    renderAll();
    setStatus(dom, state.pendingPrivateServer
      ? "Build your server ship, then press Done to create the room."
      : "Hangar ready.", "");
  }

  function showPlaceholderMenuStatus(label) {
    dom.mainMenuStatus.textContent = `${label} is coming soon. Start Single Player is available now.`;
  }

  function showPrivateRoomJoin() {
    dom.privateRoomPanel.classList.remove("hidden");
    dom.privateRoomCodeInput.focus();
    dom.mainMenuStatus.textContent = "Enter a private room code.";
  }

  function startPrivateServerFromMenu() {
    startSinglePlayer({ privateServer: true });
  }

  function joinPrivateRoomFromMenu() {
    const roomId = normalizeRoomCode(dom.privateRoomCodeInput.value);

    if (!roomId) {
      dom.mainMenuStatus.textContent = "Enter a room code first.";
      dom.privateRoomCodeInput.focus();
      return;
    }

    startSinglePlayer();
    enterWorld({ collectPieces: false });
    connectMultiplayer({ asHost: false, roomId });
  }

  function normalizeRoomCode(value) {
    return String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12);
  }

  function showOnlyView(viewName) {
    dom.tutorialView.classList.toggle("hidden", viewName !== "tutorial");
    dom.mainMenuView.classList.toggle("hidden", viewName !== "menu");
    dom.constructionView.classList.toggle("hidden", viewName !== "construction");
    dom.worldView.classList.toggle("hidden", viewName !== "world");
  }

  function installTestApi() {
    spaceCore.testApi = {
      reset: resetForTest,
      snapshot: getTestSnapshot,
      selectTile: selectTileForTest,
      placeTile: placeTileForTest,
      eraseCell: eraseCellForTest,
      rotateSelection: rotateSelectionForTest,
      loadFixture: loadFixtureForTest,
      enterWorld: enterWorldForTest,
      enterConstruction: enterConstructionForTest,
      startPrivateServer: startPrivateServerForTest,
      joinPrivateRoom: joinPrivateRoomForTest,
      stopWorld: stopWorldForTest,
      advanceWorld: advanceWorldForTest,
      selectFirstEngine: selectFirstEngineForTest,
      selectFirstWeapon: selectFirstWeaponForTest,
      turnSelectedEngines: turnSelectedEnginesForTest,
      fireAt: fireAtForTest,
      targetPoint: getTargetPointForTest,
      moveEnemyNearPlayer: moveEnemyNearPlayerForTest,
      weakenEnemyCore: weakenEnemyCoreForTest,
      moveTraderIntoRange: moveTraderIntoRangeForTest,
      openTrade: openTradeMenuForTest,
      buyTradeSlot: buyTradeSlotForTest,
      refreshTrade: refreshTradeForTest,
      sellTradeItem: sellTradeItemForTest,
      openResearch: openResearchForTest,
      researchProject: researchProjectForTest,
      setInventory: setInventoryForTest,
      setScrap: setScrapForTest,
      unlockTech: unlockTechForTest,
      damageCell: damageCellForTest,
      setShieldCharge: setShieldChargeForTest,
      addSalvagePiece: addSalvagePieceForTest,
      cellAt: getCellSnapshotForTest,
      cellsWithBlock: getCellsWithBlockForTest,
      config: {
        coreX: spaceCore.config.CORE_X,
        coreY: spaceCore.config.CORE_Y,
        columns: spaceCore.config.COLUMNS,
        rows: spaceCore.config.ROWS,
      },
    };
  }

  function resetForTest(options = {}) {
    stopWorldLoop();
    cancelScheduledWorldRender();
    closeMultiplayerForTest();

    state.selectedTileId = "ship-scaffold";
    state.activeFilter = "all";
    state.directionIndex = 0;
    state.eraseMode = false;
    state.techTreeOpen = false;
    state.activeTechSection = "weapons";
    state.selectedTechProjectId = null;
    state.hoverCell = null;
    state.hoverElement = null;
    state.scrap = Number.isFinite(options.scrap) ? options.scrap : INITIAL_SCRAP;
    state.inventory = {
      ...INITIAL_INVENTORY,
      ...(options.inventory ?? {}),
    };
    state.unlockedTechIds = new Set(options.unlockedTechIds ?? []);
    state.board = createBoard();
    state.world = createWorldState();
    state.selectedEngineIds.clear();
    state.activeEngineIds.clear();
    state.selectedWeaponIds.clear();
    clearWeaponOrder();
    state.tradeMenuOpen = false;
    state.activeTraderId = null;
    state.pendingTradeSlots.clear();
    state.controlGroups = {};
    state.pendingControlGroupAssignment = false;
    state.pendingPrivateServer = false;
    state.worldZoom = INITIAL_WORLD_ZOOM;
    state.centerConstructionOnNextRender = false;
    state.mode = "construction";
    showOnlyView("construction");
    localStorage.removeItem(SAVE_STORAGE_KEY);
    localStorage.removeItem(TUTORIAL_STORAGE_KEY);
    setStatus(dom, "Test reset.", "");
    renderAll();
    return getTestSnapshot();
  }

  function closeMultiplayerForTest() {
    multiplayerConnectionToken += 1;

    if (multiplayerClient) {
      const client = multiplayerClient;
      multiplayerClient = null;
      client.close();
    }

    state.multiplayer.connected = false;
    state.multiplayer.clientId = null;
    state.multiplayer.hostId = null;
    state.multiplayer.roomId = null;
    state.multiplayer.role = "solo";
    state.multiplayer.isHost = false;
    state.multiplayer.peerCount = 0;
    state.multiplayer.lastSnapshotAt = 0;
    state.multiplayer.lastWorldStateAt = 0;
    state.multiplayer.worldSynced = false;
    state.multiplayer.sharedWorldRenderKey = "";
    state.multiplayer.remotePlayers.clear();
  }

  function getTestSnapshot() {
    calculatePower(state.board, state.unlockedTechIds);
    const stats = getStats(state.board, state.unlockedTechIds);
    const liveEnemies = getLiveWorldEnemies();
    const liveTraders = getLiveTraders(state.world);

    return {
      mode: state.mode,
      selectedTileId: state.selectedTileId,
      selectedDirection: DIRECTIONS[state.directionIndex],
      activeFilter: state.activeFilter,
      eraseMode: state.eraseMode,
      techTreeOpen: state.techTreeOpen,
      tradeMenuOpen: state.tradeMenuOpen,
      activeTraderId: state.activeTraderId,
      scrap: state.scrap,
      inventory: clonePlain(state.inventory),
      unlockedTechIds: [...state.unlockedTechIds],
      stats,
      selectedEngineIds: [...state.selectedEngineIds],
      activeEngineIds: [...state.activeEngineIds],
      selectedWeaponIds: [...state.selectedWeaponIds],
      weaponOrder: clonePlain(state.weaponOrder),
      worldZoom: state.worldZoom,
      world: {
        ship: clonePlain(state.world.ship),
        liveEnemies: liveEnemies.length,
        liveTraders: liveTraders.length,
        pieces: state.world.pieces?.length ?? 0,
        visiblePieces: (state.world.pieces ?? []).filter((piece) => !piece.collected && !piece.destroyed).length,
        projectiles: state.world.projectiles?.length ?? 0,
        weaponEffects: state.world.weaponEffects?.length ?? 0,
      },
      multiplayer: {
        connected: state.multiplayer.connected,
        clientId: state.multiplayer.clientId,
        hostId: state.multiplayer.hostId,
        roomId: state.multiplayer.roomId,
        role: state.multiplayer.role,
        isHost: state.multiplayer.isHost,
        peerCount: state.multiplayer.peerCount,
        worldSynced: state.multiplayer.worldSynced,
        remotePlayers: state.multiplayer.remotePlayers.size,
      },
      statuses: {
        construction: dom.statusElement.textContent,
        world: dom.worldStatus.textContent,
      },
      ui: {
        constructionHidden: dom.constructionView.classList.contains("hidden"),
        worldHidden: dom.worldView.classList.contains("hidden"),
        tradeButtonHidden: dom.tradeButton.classList.contains("hidden"),
        buildButtonDisabled: dom.buildButton.disabled,
      },
    };
  }

  function selectTileForTest(tileId) {
    selectTile(tileId);
    return getTestSnapshot();
  }

  function placeTileForTest(tileId, x, y, options = {}) {
    const tile = findTileById(tileId);

    if (tile && options.ensureInventory !== false) {
      state.inventory[tileId] = Math.max(1, state.inventory[tileId] ?? 0);
    }

    if (options.direction) {
      const directionIndex = DIRECTIONS.indexOf(options.direction);

      if (directionIndex >= 0) {
        state.directionIndex = directionIndex;
      }
    }

    selectTile(tileId);

    if (state.selectedTileId === tileId) {
      placeTile(x, y);
    }

    return getTestSnapshot();
  }

  function eraseCellForTest(x, y) {
    state.eraseMode = true;
    placeTile(x, y);
    return getTestSnapshot();
  }

  function rotateSelectionForTest(times = 1) {
    const count = Math.max(1, Number(times) || 1);

    for (let index = 0; index < count; index += 1) {
      rotateSelection();
    }

    return getTestSnapshot();
  }

  function loadFixtureForTest(name = "combat") {
    resetForTest({
      scrap: 5000,
      inventory: createFullTestInventory(30),
      unlockedTechIds: RESEARCH_PROJECTS.map((project) => project.id),
    });

    if (name === "trade") {
      loadCombatFixtureForTest();
      moveTraderIntoRangeForTest(0);
    } else {
      loadCombatFixtureForTest();
    }

    setStatus(dom, `Test fixture loaded: ${name}.`, "good");
    renderAll();
    return getTestSnapshot();
  }

  function loadCombatFixtureForTest() {
    state.board = createBoard();
    state.inventory = createFullTestInventory(30);
    state.scrap = 5000;
    state.unlockedTechIds = new Set(RESEARCH_PROJECTS.map((project) => project.id));

    const cells = [
      [-2, -1, "ship-scaffold", "engine", "electric-cable", "down"],
      [-2, 0, "ship-scaffold", "engine", "electric-cable", "right"],
      [-1, -1, "ship-scaffold", "fusion-generator", "electric-cable"],
      [-1, 0, "ship-scaffold", "fusion-generator", "electric-cable"],
      [-1, 1, "ship-scaffold", "fusion-generator", "electric-cable"],
      [0, -1, "ship-scaffold", "shield-block", "electric-cable"],
      [0, 0, null, null, "electric-cable"],
      [0, 1, "ship-scaffold", "ammo-factory", "electric-cable", "right"],
      [1, -1, "ship-scaffold", "repair-bot-block", "electric-cable"],
      [1, 0, "ship-scaffold", "laser", "electric-cable"],
      [1, 1, "ship-scaffold", "conveyor-belt", "electric-cable", "right"],
      [2, -1, "ship-scaffold", "salvage-collector", "electric-cable"],
      [2, 0, "ship-scaffold", "cannon", "electric-cable"],
      [2, 1, "ship-scaffold", "cannon", "electric-cable"],
    ];

    for (const [dx, dy, baseId, blockId, underlayId, direction] of cells) {
      setRelativeCellForTest(dx, dy, { baseId, blockId, underlayId, direction });
    }

    calculatePower(state.board, state.unlockedTechIds);
  }

  function createFullTestInventory(count = 20) {
    const inventory = { ...INITIAL_INVENTORY };

    for (const tile of TILES) {
      if (!tile.locked) {
        inventory[tile.id] = count;
      }
    }

    inventory.artifact = count;
    return inventory;
  }

  function setRelativeCellForTest(dx, dy, options = {}) {
    const cell = getCell(state.board, spaceCore.config.CORE_X + dx, spaceCore.config.CORE_Y + dy);

    if (!cell) {
      return null;
    }

    if (options.baseId) {
      cell.base = createTileForTest(options.baseId, options.direction, options.baseExtra);
    }

    if (options.underlayId) {
      cell.underlay = createTileForTest(options.underlayId, options.direction, options.underlayExtra);
    }

    if (options.blockId) {
      cell.block = createTileForTest(options.blockId, options.direction, options.blockExtra);
    }

    return cell;
  }

  function createTileForTest(tileId, direction, extra = {}) {
    const tile = findTileById(tileId);
    const directionIndex = DIRECTIONS.indexOf(direction);
    const placedTile = tile
      ? createPlacedTile(tile, directionIndex >= 0 ? directionIndex : 0)
      : ensureTileHealth({ id: tileId });

    if (direction && findTileById(tileId)?.rotatable) {
      placedTile.direction = direction;
    }

    Object.assign(placedTile, extra ?? {});
    return ensureTileHealth(placedTile);
  }

  function enterWorldForTest(options = {}) {
    enterWorld(options);

    if (options.stopLoop !== false) {
      stopWorldLoop();
    }

    return getTestSnapshot();
  }

  function enterConstructionForTest() {
    enterConstruction();
    return getTestSnapshot();
  }

  function startPrivateServerForTest() {
    if (state.mode !== "world") {
      enterWorld();
    }

    connectMultiplayer({ asHost: true, createRoom: true });
    return getTestSnapshot();
  }

  function joinPrivateRoomForTest(roomId) {
    if (state.mode !== "world") {
      enterWorld({ collectPieces: false });
    }

    connectMultiplayer({ asHost: false, roomId });
    return getTestSnapshot();
  }

  function stopWorldForTest() {
    stopWorldLoop();
    cancelScheduledWorldRender();
    return getTestSnapshot();
  }

  function advanceWorldForTest(seconds = 0.1, options = {}) {
    const total = Math.max(0, Number(seconds) || 0);
    const step = Math.max(0.01, Math.min(0.05, Number(options.step) || 0.05));
    const simulatePve = options.simulatePve ?? false;
    const collectPieces = options.collectPieces ?? true;
    const updateProjectiles = options.updateProjectiles ?? true;
    let elapsed = 0;
    let mergedResult = createEmptyWorldStepResultForTest();

    calculatePower(state.board, state.unlockedTechIds);

    while (elapsed < total) {
      const dt = Math.min(step, total - elapsed);
      const result = stepWorld(
        state.world,
        state.board,
        state.activeEngineIds,
        state.inventory,
        dt,
        getRemoteShips(),
        {
          simulatePve,
          collectPieces,
          updateProjectiles,
          includeWorldTargets: options.includeWorldTargets ?? simulatePve,
          techIds: state.unlockedTechIds,
        },
      );

      applyScrapReward(result.scrapCollected);
      mergedResult = mergeWorldStepResultForTest(mergedResult, result);
      elapsed += dt;
    }

    if (mergedResult.collected.length > 0 || mergedResult.scrapCollected > 0) {
      setWorldStatus(getCollectionMessage(getCollectedPartCount(mergedResult), "Collected test salvage.", mergedResult.scrapCollected), "good");
    }

    renderAll();
    return {
      result: mergedResult,
      snapshot: getTestSnapshot(),
    };
  }

  function createEmptyWorldStepResultForTest() {
    return {
      collected: [],
      scrapCollected: 0,
      hits: [],
      ammoChanged: false,
      shipRepaired: false,
      shieldChanged: false,
      worldChanged: false,
      spawnedPieces: 0,
      spawnedEnemies: 0,
      spawnedTraders: 0,
    };
  }

  function mergeWorldStepResultForTest(target, result) {
    target.collected.push(...(result.collected ?? []));
    target.scrapCollected += result.scrapCollected ?? 0;
    target.hits.push(...(result.hits ?? []));
    target.ammoChanged = target.ammoChanged || Boolean(result.ammoChanged);
    target.shipRepaired = target.shipRepaired || Boolean(result.shipRepaired);
    target.shieldChanged = target.shieldChanged || Boolean(result.shieldChanged);
    target.worldChanged = target.worldChanged || Boolean(result.worldChanged);
    target.spawnedPieces += result.spawnedPieces ?? 0;
    target.spawnedEnemies += result.spawnedEnemies ?? 0;
    target.spawnedTraders += result.spawnedTraders ?? 0;
    return target;
  }

  function selectFirstEngineForTest(tileId = null) {
    const engine = getBoardEngineParts(state.board).find((part) => !tileId || part.cell.block?.id === tileId);

    if (engine) {
      state.selectedEngineIds.clear();
      state.selectedWeaponIds.clear();
      state.selectedEngineIds.add(engine.key);
      setWorldStatus("1 engines selected.");
      renderWorldOnly();
    }

    return {
      selected: engine?.key ?? null,
      snapshot: getTestSnapshot(),
    };
  }

  function selectFirstWeaponForTest(tileId = null) {
    const weapon = getBoardWeaponParts(state.board).find((part) => !tileId || part.cell.block?.id === tileId);

    if (weapon) {
      state.selectedWeaponIds.clear();
      state.selectedEngineIds.clear();
      state.selectedWeaponIds.add(weapon.key);
      setWorldStatus("1 weapons selected.");
      renderWorldOnly();
    }

    return {
      selected: weapon?.key ?? null,
      snapshot: getTestSnapshot(),
    };
  }

  function turnSelectedEnginesForTest(on = true) {
    turnSelectedEngines(Boolean(on));
    stopWorldLoop();
    return getTestSnapshot();
  }

  function fireAtForTest(target) {
    fireAtWorldTarget(target);
    stopWorldLoop();
    return getTestSnapshot();
  }

  function getTargetPointForTest(target = "ahead") {
    if (target === "enemy-core") {
      const enemy = getLiveWorldEnemies()[0];
      return enemy ? localToWorldPointForTest(enemy.body, 0, 0) : null;
    }

    if (target === "trader-core") {
      const trader = getLiveTraders(state.world)[0];
      return trader ? localToWorldPointForTest(trader.body, 0, 0) : null;
    }

    if (typeof target === "object" && target) {
      return localToWorldPointForTest(state.world.ship, target.localX ?? 8, target.localY ?? 0);
    }

    return localToWorldPointForTest(state.world.ship, 8, 0);
  }

  function moveEnemyNearPlayerForTest(distance = 420) {
    const enemy = getLiveWorldEnemies()[0];

    if (!enemy) {
      return getTestSnapshot();
    }

    enemy.dead = false;
    enemy.body.x = state.world.ship.x + distance;
    enemy.body.y = state.world.ship.y;
    enemy.body.vx = 0;
    enemy.body.vy = 0;
    enemy.body.angle = Math.PI;
    enemy.body.angularVelocity = 0;
    enemy.activeEngines = new Set();
    state.world.enemy = enemy;
    renderAll();
    return getTestSnapshot();
  }

  function weakenEnemyCoreForTest(hp = 1) {
    const enemy = getLiveWorldEnemies()[0];
    const coreCell = enemy?.cells?.find((cell) => cell.base?.id === "core");

    if (coreCell?.base) {
      ensureTileHealth(coreCell.base);
      coreCell.base.hp = Math.max(1, Math.min(coreCell.base.maxHp, Number(hp) || 1));
    }

    renderAll();
    return getTestSnapshot();
  }

  function moveTraderIntoRangeForTest(index = 0) {
    const traders = getLiveTraders(state.world);
    const trader = traders[index] ?? traders[0];

    if (!trader) {
      return getTestSnapshot();
    }

    trader.dead = false;
    trader.hostileToPlayer = false;
    trader.body.x = state.world.ship.x + Math.min(160, TRADER_TRADE_RADIUS / 2);
    trader.body.y = state.world.ship.y;
    trader.body.vx = 0;
    trader.body.vy = 0;
    trader.body.angle = Math.PI;
    trader.body.angularVelocity = 0;
    trader.activeEngines = new Set();
    trader.stock = [
      { kind: "part", tileId: "engine", quantity: 1, scrap: 25 },
      { kind: "part", tileId: "ship-scaffold", quantity: 3, scrap: 18 },
      { kind: "part", tileId: "electric-cable", quantity: 4, scrap: 16 },
      { kind: "part", tileId: "laser", quantity: 1, scrap: 35 },
      { kind: "artifact", name: "Ancient Artifact", quantity: 1, scrap: 80 },
    ];
    renderAll();
    return getTestSnapshot();
  }

  function openTradeMenuForTest() {
    openTradeMenu();
    return getTestSnapshot();
  }

  function buyTradeSlotForTest(slotIndex = 0) {
    buyTradeSlot(slotIndex);
    return getTestSnapshot();
  }

  function refreshTradeForTest() {
    refreshTradeStock();
    return getTestSnapshot();
  }

  function sellTradeItemForTest(tileId) {
    sellTradeItem(tileId);
    return getTestSnapshot();
  }

  function openResearchForTest(sectionId = null) {
    openTechTree();

    if (sectionId) {
      selectTechSection(sectionId);
    }

    return getTestSnapshot();
  }

  function researchProjectForTest(projectId) {
    const project = RESEARCH_PROJECTS.find((candidate) => candidate.id === projectId);

    if (project) {
      researchProject(project);
    }

    return getTestSnapshot();
  }

  function setInventoryForTest(tileIdOrInventory, count) {
    if (typeof tileIdOrInventory === "string") {
      state.inventory[tileIdOrInventory] = Math.max(0, Number(count) || 0);
    } else {
      state.inventory = {
        ...state.inventory,
        ...(tileIdOrInventory ?? {}),
      };
    }

    ensureSelectedTileAvailable();
    renderAll();
    return getTestSnapshot();
  }

  function setScrapForTest(scrap) {
    state.scrap = Math.max(0, Number(scrap) || 0);
    renderAll();
    return getTestSnapshot();
  }

  function unlockTechForTest(projectIds) {
    const ids = Array.isArray(projectIds) ? projectIds : [projectIds];

    for (const projectId of ids) {
      if (projectId) {
        state.unlockedTechIds.add(projectId);
      }
    }

    renderAll();
    return getTestSnapshot();
  }

  function damageCellForTest(x, y, layer = "block", amount = 10) {
    const cell = getCell(state.board, x, y);
    const tile = cell?.[layer];

    if (tile) {
      ensureTileHealth(tile);
      tile.hp = Math.max(1, tile.hp - Math.max(0, Number(amount) || 0));
    }

    renderAll();
    return getCellSnapshotForTest(x, y);
  }

  function setShieldChargeForTest(x, y, shieldHp) {
    const cell = getCell(state.board, x, y);

    if (cell?.block?.id === "shield-block") {
      ensureTileHealth(cell.block);
      cell.block.shieldMaxHp ??= cell.block.maxHp;
      cell.block.shieldHp = clamp(Number(shieldHp) || 0, 0, cell.block.shieldMaxHp);
    }

    renderAll();
    return getCellSnapshotForTest(x, y);
  }

  function addSalvagePieceForTest(tileId = "engine", options = {}) {
    const collector = getCellsWithBlockForTest("salvage-collector")[0];
    const localX = collector ? collector.x - spaceCore.config.CORE_X : 3;
    const localY = collector ? collector.y - spaceCore.config.CORE_Y : 0;
    const start = localToWorldPointForTest(state.world.ship, localX, localY);
    const piece = {
      id: options.id ?? `test-${tileId}-${Date.now()}`,
      tileId,
      x: options.x ?? start.x + (options.distance ?? 260),
      y: options.y ?? start.y,
      hp: options.hp ?? spaceCore.tileState.getTileMaxHp(tileId),
      maxHp: options.maxHp ?? spaceCore.tileState.getTileMaxHp(tileId),
      connectedToCore: false,
      collected: false,
      destroyed: false,
    };

    if (tileId === "scrap") {
      piece.scrap = options.scrap ?? 25;
    }

    state.world.pieces = (state.world.pieces ?? []).filter((candidate) => candidate.id !== piece.id);
    state.world.pieces.push(piece);
    renderAll();
    return clonePlain(piece);
  }

  function getCellSnapshotForTest(x, y) {
    return summarizeCellForTest(getCell(state.board, x, y));
  }

  function getCellsWithBlockForTest(tileId) {
    const cells = [];

    for (const row of state.board) {
      for (const cell of row) {
        if (cell.block?.id === tileId) {
          cells.push(summarizeCellForTest(cell));
        }
      }
    }

    return cells;
  }

  function summarizeCellForTest(cell) {
    if (!cell) {
      return null;
    }

    return {
      x: cell.x,
      y: cell.y,
      base: summarizeTileForTest(cell.base),
      block: summarizeTileForTest(cell.block),
      underlay: summarizeTileForTest(cell.underlay),
      powered: Boolean(cell.powered),
      powerNetworkGenerated: cell.powerNetworkGenerated ?? 0,
      powerNetworkRequired: cell.powerNetworkRequired ?? 0,
      powerRatio: cell.powerRatio ?? 0,
    };
  }

  function summarizeTileForTest(tile) {
    if (!tile) {
      return null;
    }

    return {
      id: tile.id,
      direction: tile.direction ?? null,
      hp: tile.hp ?? null,
      maxHp: tile.maxHp ?? null,
      ammo: tile.ammo ?? null,
      cooldownRemaining: tile.cooldownRemaining ?? 0,
      shieldHp: tile.shieldHp ?? null,
      shieldMaxHp: tile.shieldMaxHp ?? null,
    };
  }

  function localToWorldPointForTest(body, localX, localY) {
    const scaledX = localX * spaceCore.config.SHIP_WORLD_SCALE;
    const scaledY = localY * spaceCore.config.SHIP_WORLD_SCALE;
    const cos = Math.cos(body.angle);
    const sin = Math.sin(body.angle);

    return {
      x: body.x + scaledX * cos - scaledY * sin,
      y: body.y + scaledX * sin + scaledY * cos,
    };
  }

  dom.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveFilter(tab.dataset.filter, tab));
  });

  dom.rotateButton.addEventListener("click", rotateSelection);
  dom.clearButton.addEventListener("click", resetShip);
  dom.eraseButton.addEventListener("click", enterEraseMode);
  dom.researchButton.addEventListener("click", openTechTree);
  dom.closeTechTreeButton.addEventListener("click", closeTechTree);
  dom.saveButton.addEventListener("click", saveAndQuit);
  dom.doneButton.addEventListener("click", enterWorld);
  dom.buildButton.addEventListener("click", enterConstruction);
  dom.tradeButton.addEventListener("click", openTradeMenu);
  dom.closeTradeButton.addEventListener("click", closeTradeMenu);
  dom.tradeRefreshButton.addEventListener("click", refreshTradeStock);
  dom.zoomOutButton.addEventListener("click", () => zoomWorld(-WORLD_ZOOM_STEP));
  dom.zoomInButton.addEventListener("click", () => zoomWorld(WORLD_ZOOM_STEP));
  dom.engineOnButton.addEventListener("click", () => turnSelectedEngines(true));
  dom.engineOffButton.addEventListener("click", () => turnSelectedEngines(false));
  dom.clearSelectionButton.addEventListener("click", () => clearWorldSelection());
  dom.hostButton.addEventListener("click", hostMultiplayer);
  dom.joinButton.addEventListener("click", joinMultiplayer);
  dom.leaveButton.addEventListener("click", () => leaveMultiplayer());
  dom.tutorialBackButton.addEventListener("click", previousTutorialStep);
  dom.tutorialNextButton.addEventListener("click", nextTutorialStep);
  dom.skipTutorialButton.addEventListener("click", skipTutorial);
  dom.startSinglePlayerButton.addEventListener("click", startSinglePlayer);
  dom.joinPublicServerButton.addEventListener("click", () => showPlaceholderMenuStatus("Public multiplayer"));
  dom.joinPrivateServerButton.addEventListener("click", showPrivateRoomJoin);
  dom.joinPrivateRoomButton.addEventListener("click", joinPrivateRoomFromMenu);
  dom.privateRoomCodeInput.addEventListener("input", () => {
    dom.privateRoomCodeInput.value = normalizeRoomCode(dom.privateRoomCodeInput.value);
  });
  dom.privateRoomCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      joinPrivateRoomFromMenu();
    }
  });
  dom.startNewServerButton.addEventListener("click", startPrivateServerFromMenu);
  dom.worldMap.addEventListener("pointerdown", handleWorldMapPointerDown, { capture: true });
  dom.worldMap.addEventListener("click", handleWorldMapClick, { capture: true });
  dom.techTreeOverlay.addEventListener("click", (event) => {
    if (event.target === dom.techTreeOverlay) {
      closeTechTree();
    }
  });
  dom.tradeOverlay.addEventListener("click", (event) => {
    if (event.target === dom.tradeOverlay) {
      closeTradeMenu();
    }
  });

  document.addEventListener("keydown", handleKeyDown);

  if (TEST_MODE) {
    installTestApi();
  }

  const loadedSave = !TEST_MODE && loadSavedProgress();
  if (loadedSave) {
    setStatus(dom, "Saved progress loaded.", "good");
  }
  loadShareUrl();

  if (TEST_MODE) {
    showOnlyView("construction");
    renderAll();
  } else {
    initializeEntryFlow();
  }
})(window.SpaceCore = window.SpaceCore || {});
