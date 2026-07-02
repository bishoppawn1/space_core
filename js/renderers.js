(function (spaceCore) {
  "use strict";

  const {
    decorateTilePreview,
    createTilePreview,
    createTileLabel,
    createCostPill,
    createUnderlayShape,
    createBaseShape,
    createBlockShape,
  } = spaceCore.tileViews;

  function renderPalette({
    dom,
    tiles,
    activeFilter,
    selectedTileId,
    eraseMode,
    directionIndex,
    inventory,
    unlockedTechIds = new Set(),
    onSelectTile,
  }) {
    dom.paletteElement.innerHTML = "";
    let visibleCount = 0;

    for (const tile of tiles) {
      if (activeFilter !== "all" && tile.layer !== activeFilter) {
        continue;
      }

      if (!isTilePaletteVisible(tile, inventory)) {
        continue;
      }

      const button = document.createElement("button");
      const needsResearch = isTileResearchLocked(tile, unlockedTechIds);
      button.type = "button";
      button.className = "tile-button";
      button.dataset.tileId = tile.id;
      button.title = needsResearch ? `${tile.name} needs research` : tile.name;

      if (needsResearch) {
        button.classList.add("research-needed");
      }

      if (tile.id === selectedTileId && !eraseMode && !needsResearch) {
        button.classList.add("active");
      }

      button.append(
        createTilePreview(tile, directionIndex),
        createTileLabel(tile),
        createInventoryPill(tile, inventory, unlockedTechIds),
      );

      if (needsResearch) {
        button.append(createResearchNeededBadge());
      }

      button.addEventListener("click", () => onSelectTile(tile.id));

      dom.paletteElement.append(button);
      visibleCount += 1;
    }

    if (visibleCount === 0) {
      const empty = document.createElement("p");
      empty.className = "palette-empty";
      empty.textContent = "No available parts";
      dom.paletteElement.append(empty);
    }
  }

  function createInventoryPill(tile, inventory, unlockedTechIds) {
    const count = document.createElement("span");
    count.className = "cost-pill";
    count.textContent = `x${inventory[tile.id] ?? 0}`;
    return count;
  }

  function createResearchNeededBadge() {
    const badge = document.createElement("span");
    badge.className = "research-needed-badge";
    badge.textContent = "Need research";
    return badge;
  }

  function isTilePaletteVisible(tile, inventory) {
    return Boolean(tile && !tile.locked && (inventory[tile.id] ?? 0) > 0);
  }

  function renderBoard({
    dom,
    board,
    hoverCell,
    validateCell,
    onHoverCell,
    onLeaveCell,
    onPlaceCell,
  }) {
    dom.boardElement.innerHTML = "";
    dom.boardElement.style.gridTemplateColumns = `repeat(${board[0]?.length ?? 0}, var(--cell))`;
    dom.boardElement.style.gridTemplateRows = `repeat(${board.length}, var(--cell))`;

    for (const row of board) {
      for (const cell of row) {
        const cellElement = document.createElement("button");
        cellElement.type = "button";
        cellElement.className = "cell";
        cellElement.setAttribute("aria-label", `Cell ${cell.x}, ${cell.y}`);

        if (cell.base?.id === "core") {
          cellElement.classList.add("core-cell");
        }

        if (cell.powered) {
          cellElement.classList.add("powered");
        }

        if ((cell.powerRequired ?? 0) > 0 && !cell.powered) {
          cellElement.classList.add("underpowered");
        }

        if (hoverCell?.x === cell.x && hoverCell?.y === cell.y) {
          const preview = validateCell(cell.x, cell.y);
          cellElement.classList.add(preview.ok ? "valid-preview" : "invalid-preview");
        }

        if (cell.underlay) {
          cellElement.append(createUnderlayShape());
        }

        if (cell.base) {
          cellElement.append(createBaseShape(cell.base));
        }

        if (cell.block) {
          cellElement.append(createBlockShape(cell.block));
        }

        cellElement.addEventListener("mouseenter", () => onHoverCell(cell.x, cell.y, cellElement));
        cellElement.addEventListener("mouseleave", () => onLeaveCell(cellElement));
        cellElement.addEventListener("click", () => onPlaceCell(cell.x, cell.y));
        dom.boardElement.append(cellElement);
      }
    }
  }

  function renderInspector({ dom, tile, directionIndex, eraseMode, inventory, unlockedTechIds = new Set() }) {
    decorateTilePreview(dom.selectedPreview, tile, directionIndex, "large");
    dom.selectedLayer.textContent = tile.layer;
    dom.selectedName.textContent = tile.name;
    dom.selectedCost.textContent = tile.locked ? "fixed" : `${inventory[tile.id] ?? 0} stored`;
    dom.selectedPlacement.textContent = tile.placement;
    dom.selectedOutput.textContent = formatTileOutput(tile, unlockedTechIds);
    dom.rotateButton.disabled = !tile.rotatable || eraseMode;
  }

  function renderStats({ dom, stats, scrap }) {
    dom.scrapValue.textContent = scrap;
    dom.powerValue.textContent = stats.power;
    dom.massValue.textContent = stats.mass;
    dom.scaffoldCount.textContent = stats.scaffolds;
    dom.generatorCount.textContent = stats.generators;
    dom.poweredCount.textContent = stats.poweredBlocks;
    dom.weaponCount.textContent = stats.weapons;
  }

  function renderInventory({ container, tiles, inventory }) {
    container.innerHTML = "";

    for (const tile of tiles) {
      if (tile.locked) {
        continue;
      }

      const row = document.createElement("div");
      row.className = "inventory-item";
      row.append(createTilePreview(tile, 0), createInventoryLabel(tile, inventory));
      container.append(row);
    }
  }

  function renderTradeMenu({
    dom,
    tiles,
    inventory,
    scrap,
    trader,
    isOpen,
    canTrade,
    unlockedTechIds = new Set(),
    pendingSlotIndexes = new Set(),
    refreshCost = 0,
    refreshPending = false,
    onBuySlot,
    onSellItem,
    getSellPrice,
  }) {
    dom.tradeOverlay.classList.toggle("hidden", !isOpen);
    dom.tradeScrapValue.textContent = scrap;
    if (dom.tradeRefreshButton) {
      dom.tradeRefreshButton.textContent = refreshPending
        ? "Refreshing..."
        : `Refresh ${refreshCost} scrap`;
      dom.tradeRefreshButton.disabled = !canTrade || refreshPending || scrap < refreshCost;
    }

    if (!isOpen) {
      return;
    }

    dom.tradeTitle.textContent = trader?.name ?? "Trade";
    dom.tradeSubtitle.textContent = getTradeSubtitle(trader, canTrade);
    dom.tradeStockGrid.innerHTML = "";
    dom.tradeCargoList.innerHTML = "";
    renderTradeCargoList(dom.tradeCargoList, tiles, inventory, unlockedTechIds, {
      canTrade,
      onSellItem,
      getSellPrice,
    });

    const slotCount = spaceCore.config.TRADER_STOCK_SLOT_COUNT ?? 5;
    const stock = Array.isArray(trader?.stock) ? trader.stock : [];

    for (let index = 0; index < slotCount; index += 1) {
      dom.tradeStockGrid.append(createTradeStockSlot({
        item: stock[index],
        index,
        tiles,
        scrap,
        canTrade,
        pending: pendingSlotIndexes.has(index),
        onBuySlot,
      }));
    }
  }

  function getTradeSubtitle(trader, canTrade) {
    if (!trader) {
      return "No trader selected";
    }

    if (trader.hostileToPlayer) {
      return "Hostile trader";
    }

    return canTrade ? "Trader ship in range" : "Move into the yellow trade radius";
  }

  function renderTradeCargoList(container, tiles, inventory, unlockedTechIds, options = {}) {
    const { canTrade = false, onSellItem, getSellPrice } = options;
    let rendered = 0;

    for (const tile of tiles) {
      const count = inventory[tile.id] ?? 0;

      if (tile.locked || count <= 0) {
        continue;
      }

      const row = document.createElement("div");
      const label = document.createElement("span");
      const name = document.createElement("strong");
      const meta = document.createElement("span");
      row.className = "trade-cargo-row";
      label.className = "trade-cargo-label";
      name.textContent = tile.name;
      meta.textContent = isTileResearchLocked(tile, unlockedTechIds) ? "Need research" : `x${count}`;
      label.append(name, meta);
      row.append(createTilePreview(tile, 0), label);

      if (typeof onSellItem === "function") {
        const button = document.createElement("button");
        const price = typeof getSellPrice === "function" ? getSellPrice(tile.id, 1) : 0;
        button.type = "button";
        button.className = "mini-action";
        button.textContent = `Sell ${price}`;
        button.disabled = !canTrade || price <= 0;
        button.title = `Sell one ${tile.name} for ${price} scrap`;
        button.addEventListener("click", () => onSellItem(tile.id));
        row.append(button);
      }

      container.append(row);
      rendered += 1;
    }

    if ((inventory.artifact ?? 0) > 0) {
      const row = document.createElement("div");
      const label = document.createElement("span");
      const name = document.createElement("strong");
      const meta = document.createElement("span");
      row.className = "trade-cargo-row artifact";
      label.className = "trade-cargo-label";
      name.textContent = "Ancient Artifact";
      meta.textContent = `x${inventory.artifact}`;
      label.append(name, meta);
      row.append(createArtifactPreview(), label);
      container.append(row);
      rendered += 1;
    }

    if (rendered === 0) {
      const empty = document.createElement("p");
      empty.className = "trade-empty";
      empty.textContent = "No stored pieces";
      container.append(empty);
    }
  }

  function createTradeStockSlot({ item, index, tiles, scrap, canTrade, pending, onBuySlot }) {
    const slot = document.createElement("article");
    const preview = document.createElement("div");
    const body = document.createElement("div");
    const name = document.createElement("strong");
    const meta = document.createElement("span");
    const description = document.createElement("p");
    const button = document.createElement("button");

    slot.className = "trade-slot";
    preview.className = "trade-slot-preview";
    body.className = "trade-slot-body";
    description.className = "trade-slot-description";
    button.type = "button";
    button.className = "mini-action";

    if (!item) {
      slot.classList.add("empty");
      name.textContent = "Empty slot";
      meta.textContent = "No stock";
      description.textContent = "This trader slot has no item.";
      button.textContent = "Empty";
      button.disabled = true;
      preview.classList.add("empty");
    } else if (item.kind === "artifact") {
      slot.classList.add("artifact");
      name.textContent = item.name ?? "Ancient Artifact";
      meta.textContent = `x${item.quantity ?? 1}`;
      description.textContent = item.description ?? "A rare artifact with unusual research value.";
      button.textContent = `${item.scrap} scrap`;
      button.disabled = !canTrade || pending || scrap < item.scrap;
      preview.append(createArtifactPreview());
    } else {
      const tile = tiles.find((candidate) => candidate.id === item.tileId);
      slot.classList.add(item.tileId ?? "part");
      name.textContent = tile?.name ?? formatTileName(item.tileId);
      meta.textContent = `x${item.quantity ?? 1}`;
      description.textContent = tile?.output ?? "Ship part";
      button.textContent = `${item.scrap} scrap`;
      button.disabled = !tile || !canTrade || pending || scrap < item.scrap;

      if (tile) {
        preview.append(createTilePreview(tile, 0));
      } else {
        preview.classList.add("empty");
      }
    }

    if (pending) {
      button.textContent = "Buying...";
    }

    button.addEventListener("click", () => onBuySlot(index));
    body.append(name, meta, description);
    slot.append(preview, body, button);
    return slot;
  }

  function createArtifactPreview() {
    const preview = document.createElement("span");
    preview.className = "artifact-preview";
    return preview;
  }

  const RESEARCH_SECTIONS = [
    { id: "weapons", name: "Weapons" },
    { id: "mobility", name: "Mobility" },
    { id: "power", name: "Power" },
    { id: "logistics", name: "Logistics" },
  ];

  function renderTechTree({
    dom,
    tiles,
    projects,
    scrap,
    inventory,
    unlockedTechIds,
    isOpen,
    activeSection = "weapons",
    selectedProjectId = null,
    onSelectSection,
    onSelectProject,
    onCloseProject,
    onResearch,
  }) {
    dom.techTreeOverlay.classList.toggle("hidden", !isOpen);
    dom.techTreeScrapValue.textContent = scrap;
    renderTechTreeTabs(dom, activeSection, onSelectSection);
    dom.techTreeGrid.innerHTML = "";

    if (!isOpen) {
      return;
    }

    const sectionId = isResearchSection(activeSection) ? activeSection : "weapons";
    const sectionProjects = getResearchSectionProjects(projects, tiles, sectionId);
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const activeProjectMap = new Map(sectionProjects.map((project) => [project.id, project]));

    dom.techTreeGrid.append(createTechTreeMap({
      projects: sectionProjects,
      projectMap: activeProjectMap,
      allProjects: projectMap,
      tiles,
      scrap,
      inventory,
      unlockedTechIds,
      selectedProjectId,
      onSelectProject,
    }));

    const selectedProject = sectionProjects.find((project) => project.id === selectedProjectId);

    if (selectedProject) {
      dom.techTreeGrid.append(createTechDetailPopup({
        project: selectedProject,
        projectMap,
        tile: tiles.find((candidate) => candidate.id === selectedProject.unlocks),
        tiles,
        scrap,
        inventory,
        unlockedTechIds,
        onCloseProject,
        onResearch,
      }));
    }
  }

  function renderTechTreeTabs(dom, activeSection, onSelectSection) {
    dom.techTreeTabs.innerHTML = "";

    for (const section of RESEARCH_SECTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tech-tree-tab";
      button.dataset.section = section.id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", section.id === activeSection ? "true" : "false");
      button.textContent = section.name;

      if (section.id === activeSection) {
        button.classList.add("active");
      }

      button.addEventListener("click", () => onSelectSection(section.id));
      dom.techTreeTabs.append(button);
    }
  }

  function createTechTreeMap({
    projects,
    projectMap,
    allProjects,
    tiles,
    scrap,
    inventory,
    unlockedTechIds,
    selectedProjectId,
    onSelectProject,
  }) {
    const map = document.createElement("div");
    map.className = "tech-tree-map";

    if (projects.length === 0) {
      const empty = document.createElement("p");
      empty.className = "tech-tree-empty";
      empty.textContent = "No research in this section";
      map.append(empty);
      return map;
    }

    const maxTier = Math.max(...projects.map(getResearchTier));
    const maxLane = Math.max(...projects.map(getResearchLane));
    map.style.gridTemplateColumns = `repeat(${maxTier + 1}, minmax(152px, 1fr))`;
    map.style.gridTemplateRows = `repeat(${maxLane + 1}, minmax(86px, auto))`;

    map.append(createTechTreeLinks(projects, projectMap, maxTier, maxLane, unlockedTechIds));

    for (const project of projects) {
      const tile = tiles.find((candidate) => candidate.id === project.unlocks);
      const node = createTechTreeNode({
        project,
        allProjects,
        tile,
        tiles,
        scrap,
        inventory,
        unlockedTechIds,
        selectedProjectId,
        onSelectProject,
      });
      node.style.gridColumn = String(getResearchTier(project) + 1);
      node.style.gridRow = String(getResearchLane(project) + 1);
      map.append(node);
    }

    return map;
  }

  function createTechTreeLinks(projects, projectMap, maxTier, maxLane, unlockedTechIds) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("tech-tree-links");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");

    for (const project of projects) {
      for (const requiredId of project.requires ?? []) {
        const requiredProject = projectMap.get(requiredId);

        if (!requiredProject) {
          continue;
        }

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        const x1 = ((getResearchTier(requiredProject) + 0.78) / (maxTier + 1)) * 100;
        const y1 = ((getResearchLane(requiredProject) + 0.5) / (maxLane + 1)) * 100;
        const x2 = ((getResearchTier(project) + 0.22) / (maxTier + 1)) * 100;
        const y2 = ((getResearchLane(project) + 0.5) / (maxLane + 1)) * 100;
        line.setAttribute("x1", x1.toFixed(2));
        line.setAttribute("y1", y1.toFixed(2));
        line.setAttribute("x2", x2.toFixed(2));
        line.setAttribute("y2", y2.toFixed(2));
        line.classList.add("tech-tree-link");

        if (unlockedTechIds.has(requiredId) && unlockedTechIds.has(project.id)) {
          line.classList.add("complete");
        } else if (unlockedTechIds.has(requiredId)) {
          line.classList.add("available");
        }

        svg.append(line);
      }
    }

    return svg;
  }

  function createTechTreeNode({
    project,
    allProjects,
    tile,
    tiles,
    scrap,
    inventory,
    unlockedTechIds,
    selectedProjectId,
    onSelectProject,
  }) {
    const unlocked = unlockedTechIds.has(project.id);
    const prerequisitesMet = areResearchPrerequisitesMet(project, unlockedTechIds);
    const affordable = canAffordResearch(project, scrap, inventory);
    const node = document.createElement("button");
    node.type = "button";
    node.className = "tech-node";
    node.dataset.projectId = project.id;
    node.dataset.tier = getResearchTier(project);

    if (unlocked) {
      node.classList.add("complete");
    } else if (!prerequisitesMet) {
      node.classList.add("gated");
    } else if (affordable) {
      node.classList.add("available");
    } else {
      node.classList.add("scarce");
    }

    if (project.id === selectedProjectId) {
      node.classList.add("selected");
    }

    const preview = tile ? createTilePreview(tile, 0) : createTechSymbol(project);
    const content = document.createElement("div");
    content.className = "tech-node-content";

    const titleRow = document.createElement("span");
    titleRow.className = "tech-node-title";
    const title = document.createElement("strong");
    const status = document.createElement("span");
    title.textContent = project.name;
    status.textContent = getResearchStatusLabel(project, unlockedTechIds, affordable, prerequisitesMet);
    titleRow.append(title, status);

    const cost = document.createElement("p");
    cost.textContent = formatResearchCost(project, tiles);

    const requires = document.createElement("small");
    requires.textContent = getRequirementLabel(project, allProjects, unlockedTechIds);

    content.append(titleRow, cost, requires);
    node.append(preview, content);
    node.addEventListener("click", () => onSelectProject(project));
    return node;
  }

  function createTechDetailPopup({
    project,
    projectMap,
    tile,
    tiles,
    scrap,
    inventory,
    unlockedTechIds,
    onCloseProject,
    onResearch,
  }) {
    const unlocked = unlockedTechIds.has(project.id);
    const prerequisitesMet = areResearchPrerequisitesMet(project, unlockedTechIds);
    const affordable = canAffordResearch(project, scrap, inventory);
    const popup = document.createElement("div");
    popup.className = "tech-detail-backdrop";
    popup.addEventListener("click", (event) => {
      if (event.target === popup) {
        onCloseProject();
      }
    });

    const card = document.createElement("article");
    card.className = "tech-detail-card";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tool-button tech-detail-close";
    close.title = "Close tech details";
    close.textContent = "x";
    close.addEventListener("click", onCloseProject);

    const header = document.createElement("header");
    header.className = "tech-detail-header";
    const preview = tile ? createTilePreview(tile, 0, "large") : createTechSymbol(project, true);
    const titleBlock = document.createElement("div");
    const section = document.createElement("span");
    const title = document.createElement("h3");
    const status = document.createElement("span");
    section.className = "tech-detail-section";
    section.textContent = getResearchSectionName(project.section);
    title.textContent = project.name;
    status.className = "tech-detail-status";
    status.textContent = getResearchStatusLabel(project, unlockedTechIds, affordable, prerequisitesMet);
    titleBlock.append(section, title, status);
    header.append(preview, titleBlock, close);

    const description = document.createElement("p");
    description.className = "tech-detail-description";
    description.textContent = project.description ?? "No description available.";

    const effect = document.createElement("p");
    effect.className = "tech-detail-effect";
    effect.textContent = project.effect ?? "Unlocks a new research step.";

    const cost = document.createElement("dl");
    cost.className = "tech-detail-list";
    appendDetailRow(cost, "Cost", formatResearchCost(project, tiles));
    appendDetailRow(cost, "Requires", formatRequirements(project, projectMap, unlockedTechIds));
    appendDetailRow(cost, "Unlocks", tile?.name ?? "Ship upgrade");

    const action = document.createElement("button");
    action.type = "button";
    action.className = "primary-button tech-detail-research";
    action.dataset.projectId = project.id;
    action.textContent = unlocked ? "Researched" : "Research";
    action.disabled = unlocked || !prerequisitesMet || !affordable;
    action.addEventListener("click", () => onResearch(project));

    card.append(header, description, effect, cost, action);
    popup.append(card);
    return popup;
  }

  function appendDetailRow(list, term, value) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    row.append(dt, dd);
    list.append(row);
  }

  function getResearchSectionProjects(projects, tiles, sectionId) {
    return projects
      .filter((project) => getProjectSection(project, tiles) === sectionId)
      .sort((a, b) => (
        getResearchTier(a) - getResearchTier(b) ||
        getResearchLane(a) - getResearchLane(b) ||
        a.name.localeCompare(b.name)
      ));
  }

  function getProjectSection(project, tiles) {
    if (isResearchSection(project.section)) {
      return project.section;
    }

    const tile = tiles.find((candidate) => candidate.id === project.unlocks);

    if (isWeaponTile(tile?.id)) {
      return "weapons";
    }

    if (isEngineTile(tile?.id)) {
      return "mobility";
    }

    if (spaceCore.config.POWER_GENERATOR_TILE_IDS.includes(tile?.id)) {
      return "power";
    }

    return "logistics";
  }

  function getResearchTier(project) {
    return Math.max(0, Number(project.tier) || 0);
  }

  function getResearchLane(project) {
    return Math.max(0, Number(project.lane) || 0);
  }

  function areResearchPrerequisitesMet(project, unlockedTechIds) {
    return (project.requires ?? []).every((projectId) => unlockedTechIds.has(projectId));
  }

  function getResearchStatusLabel(project, unlockedTechIds, affordable, prerequisitesMet) {
    if (unlockedTechIds.has(project.id)) {
      return "Done";
    }

    if (!prerequisitesMet) {
      return "Gated";
    }

    return affordable ? "Ready" : "Need";
  }

  function getRequirementLabel(project, projectMap, unlockedTechIds) {
    const requirements = project.requires ?? [];

    if (requirements.length === 0) {
      return "Root tech";
    }

    const missing = requirements.filter((projectId) => !unlockedTechIds.has(projectId));

    if (missing.length === 0) {
      return "Prereqs met";
    }

    return `Needs ${missing.map((projectId) => projectMap.get(projectId)?.name ?? formatTileName(projectId)).join(", ")}`;
  }

  function formatRequirements(project, projectMap, unlockedTechIds) {
    const requirements = project.requires ?? [];

    if (requirements.length === 0) {
      return "None";
    }

    return requirements
      .map((projectId) => {
        const name = projectMap.get(projectId)?.name ?? formatTileName(projectId);
        return unlockedTechIds.has(projectId) ? `${name} (done)` : name;
      })
      .join(", ");
  }

  function createTechSymbol(project, large = false) {
    const symbol = document.createElement("span");
    symbol.className = `tech-symbol ${project.section ?? "logistics"}`;

    if (large) {
      symbol.classList.add("large");
    }

    symbol.textContent = project.name.charAt(0);
    return symbol;
  }

  function getResearchSectionName(sectionId) {
    return RESEARCH_SECTIONS.find((section) => section.id === sectionId)?.name ?? "Research";
  }

  function isResearchSection(sectionId) {
    return RESEARCH_SECTIONS.some((section) => section.id === sectionId);
  }

  function createInventoryLabel(tile, inventory) {
    const label = document.createElement("span");
    const name = document.createElement("span");
    const count = document.createElement("strong");

    name.textContent = tile.name;
    count.textContent = inventory[tile.id] ?? 0;
    label.append(name, count);
    return label;
  }

  function formatTileOutput(tile, unlockedTechIds) {
    const output = spaceCore.powerSystem.getTilePowerOutput(tile.id, unlockedTechIds);
    const requirement = spaceCore.powerSystem.getTilePowerRequirement(tile.id);

    if (output > 0) {
      return `${tile.output} Current output: ${output} power.`;
    }

    if (requirement > 0) {
      return `${tile.output} Requires ${requirement} power from its connected network.`;
    }

    return tile.output;
  }

  function renderWorld({
    dom,
    world,
    board,
    tiles,
    scrap,
    inventory,
    worldStats,
    selectedEngineIds,
    activeEngineIds,
    selectedWeaponIds,
    weaponTarget,
    remotePlayers = [],
    worldZoom,
    onSelectEngine,
    onSelectWeapon,
    onTargetPoint,
  }) {
    dom.worldMap.innerHTML = "";
    dom.worldScrapValue.textContent = scrap;
    dom.worldCargoValue.textContent = getCargoCount(inventory, tiles);
    dom.worldRangeValue.textContent = worldStats.reach;
    dom.worldSpeedValue.textContent = worldStats.speed;
    dom.selectedEnginesCount.textContent = selectedEngineIds.size;
    dom.activeEnginesCount.textContent = activeEngineIds.size;
    dom.selectedWeaponsCount.textContent = selectedWeaponIds.size;
    dom.enemyCoreStatus.textContent = worldStats.enemyCoreOnline ? `${worldStats.liveEnemies ?? 1} online` : "down";
    const renderContext = createWorldRenderContext(dom.worldMap, world, worldZoom);
    const worldSpace = createWorldSpace(dom.worldMap, world, worldZoom, renderContext);
    renderShipOnWorld({
      worldMap: worldSpace,
      body: world.ship,
      board,
      selectedEngineIds,
      activeEngineIds,
      selectedWeaponIds,
      onSelectEngine,
      onSelectWeapon,
    });
    renderRemotePlayerShips(worldSpace, remotePlayers, onTargetPoint, renderContext);
    renderTraderShips(worldSpace, world, onTargetPoint, renderContext);
    renderEnemyShip(worldSpace, world, onTargetPoint, renderContext);
    renderWorldPieces(worldSpace, world, tiles, renderContext);
    renderWeaponTarget(worldSpace, weaponTarget, renderContext);
    renderWeaponEffects(worldSpace, world, renderContext);
    renderProjectiles(worldSpace, world, renderContext);
  }

  function createWorldSpace(worldMap, world, worldZoom, renderContext) {
    const worldSpace = document.createElement("div");
    worldSpace.className = "world-space";
    worldSpace.style.width = "1px";
    worldSpace.style.height = "1px";

    const backdrop = document.createElement("span");
    backdrop.className = "world-backdrop";
    worldSpace.append(backdrop);

    worldMap.append(worldSpace);
    updateWorldCamera(worldMap, worldSpace, world, worldZoom, renderContext);
    return worldSpace;
  }

  function syncWorldZones(worldSpace, renderContext) {
    if (!worldSpace || !renderContext) {
      return;
    }

    const zones = [
      ["outer", spaceCore.config.WORLD_RADIUS],
      ["middle", spaceCore.config.WORLD_MIDDLE_RADIUS],
      ["core", spaceCore.config.WORLD_CORE_RADIUS],
    ];
    const visibleZoneIds = new Set();

    for (const [zone, radius] of zones) {
      if (!isCircularBorderVisible(radius, renderContext)) {
        continue;
      }

      visibleZoneIds.add(zone);
      let element = worldSpace.querySelector(`.world-zone[data-zone="${zone}"]`);

      if (!element) {
        element = document.createElement("span");
        element.className = `world-zone zone-${zone}`;
        element.dataset.zone = zone;
        worldSpace.append(element);
      }

      setCircularWorldElement(element, radius);
    }

    worldSpace.querySelectorAll(".world-zone").forEach((zoneElement) => {
      if (!visibleZoneIds.has(zoneElement.dataset.zone)) {
        zoneElement.remove();
      }
    });

    worldSpace.querySelector(".world-boundary")?.remove();
  }

  function setCircularWorldElement(element, radius) {
    element.style.left = `${spaceCore.config.WORLD_CENTER_X}px`;
    element.style.top = `${spaceCore.config.WORLD_CENTER_Y}px`;
    element.style.width = `${radius * 2}px`;
    element.style.height = `${radius * 2}px`;
  }

  function createWorldRenderContext(worldMap, world, worldZoom) {
    const zoom = Math.max(0.2, worldZoom ?? 1);
    const viewportRadius = Math.hypot(worldMap.clientWidth, worldMap.clientHeight) / (2 * zoom);
    const activeRadius = spaceCore.config.WORLD_ACTIVE_SIM_RADIUS ?? 2800;
    const renderRadius = Math.max(activeRadius + 650, viewportRadius + 780);
    const center = world?.ship ?? {
      x: spaceCore.config.WORLD_CENTER_X,
      y: spaceCore.config.WORLD_CENTER_Y,
    };

    return {
      center,
      renderRadius,
      viewportRadius,
      zoom,
    };
  }

  function isWorldPointVisible(point, renderContext, extraRadius = 0) {
    if (!point || !renderContext) {
      return true;
    }

    return getWorldDistance(point, renderContext.center) <= renderContext.renderRadius + extraRadius;
  }

  function isWorldSegmentVisible(effect, renderContext) {
    if (!effect || !renderContext) {
      return true;
    }

    if (
      isWorldPointVisible({ x: effect.x1, y: effect.y1 }, renderContext, 160) ||
      isWorldPointVisible({ x: effect.x2, y: effect.y2 }, renderContext, 160)
    ) {
      return true;
    }

    return getPointToSegmentDistance(renderContext.center, effect) <= renderContext.renderRadius + 160;
  }

  function isCircularBorderVisible(radius, renderContext) {
    const distanceFromWorldCenter = Math.hypot(
      renderContext.center.x - spaceCore.config.WORLD_CENTER_X,
      renderContext.center.y - spaceCore.config.WORLD_CENTER_Y,
    );
    return Math.abs(distanceFromWorldCenter - radius) <= renderContext.viewportRadius + 360;
  }

  function getWorldDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function getPointToSegmentDistance(point, segment) {
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return getWorldDistance(point, { x: segment.x1, y: segment.y1 });
    }

    const t = Math.max(0, Math.min(1, ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSquared));
    return Math.hypot(point.x - (segment.x1 + dx * t), point.y - (segment.y1 + dy * t));
  }

  function renderShipOnWorld({
    worldMap,
    body,
    board,
    selectedEngineIds,
    activeEngineIds,
    selectedWeaponIds,
    onSelectEngine,
    onSelectWeapon,
  }) {
    const ship = document.createElement("div");
    ship.className = "world-ship player-ship";
    ship.style.left = `${body.x}px`;
    ship.style.top = `${body.y}px`;
    ship.style.transform = `translate(-50%, -50%) rotate(${body.angle}rad)`;

    appendShieldRanges(ship, board, (cell) => ({
      x: (cell.x - spaceCore.config.CORE_X) * spaceCore.config.SHIP_WORLD_SCALE,
      y: (cell.y - spaceCore.config.CORE_Y) * spaceCore.config.SHIP_WORLD_SCALE,
    }));

    for (const row of board) {
      for (const cell of row) {
        if (!cell.base && !cell.block && !cell.underlay) {
          continue;
        }

        const key = `${cell.x},${cell.y}`;
        const part = createPlayerShipPart({
          cell,
          key,
          selectedEngineIds,
          activeEngineIds,
          selectedWeaponIds,
          onSelectEngine,
          onSelectWeapon,
        });
        part.style.left = `${(cell.x - spaceCore.config.CORE_X) * spaceCore.config.SHIP_WORLD_SCALE}px`;
        part.style.top = `${(cell.y - spaceCore.config.CORE_Y) * spaceCore.config.SHIP_WORLD_SCALE}px`;
        ship.append(part);
      }
    }

    worldMap.append(ship);
  }

  function renderRemotePlayerShips(worldMap, remotePlayers, onTargetPoint, renderContext) {
    for (const player of remotePlayers) {
      if (!player?.body || !player?.board) {
        continue;
      }

      if (!isWorldPointVisible(player.body, renderContext, 240)) {
        continue;
      }

      const ship = document.createElement("div");
      ship.className = "world-ship remote-player-ship";
      ship.dataset.playerId = player.id;
      ship.style.left = `${player.body.x}px`;
      ship.style.top = `${player.body.y}px`;
      ship.style.transform = `translate(-50%, -50%) rotate(${player.body.angle}rad)`;

      const label = document.createElement("span");
      label.className = "remote-player-label";
      label.textContent = `P${player.id}`;
      ship.append(label);

      const activeEngineIds = new Set(player.activeEngineIds ?? []);
      appendShieldRanges(ship, player.board, (cell) => ({
        x: (cell.x - spaceCore.config.CORE_X) * spaceCore.config.SHIP_WORLD_SCALE,
        y: (cell.y - spaceCore.config.CORE_Y) * spaceCore.config.SHIP_WORLD_SCALE,
      }));

      for (const row of player.board) {
        for (const cell of row) {
          if (!cell.base && !cell.block && !cell.underlay) {
            continue;
          }

          const key = `${cell.x},${cell.y}`;
          const part = document.createElement("button");
          part.className = getWorldShipPartClass(cell);
          part.type = "button";
          part.title = cell.base?.id === "core" ? `Player ${player.id} core` : `Player ${player.id} ship part`;
          part.dataset.partKey = key;
          part.style.left = `${(cell.x - spaceCore.config.CORE_X) * spaceCore.config.SHIP_WORLD_SCALE}px`;
          part.style.top = `${(cell.y - spaceCore.config.CORE_Y) * spaceCore.config.SHIP_WORLD_SCALE}px`;
          part.addEventListener("click", (event) => {
            event.stopPropagation();
            onTargetPoint(localToWorld(player.body, cell.x - spaceCore.config.CORE_X, cell.y - spaceCore.config.CORE_Y));
          });

          if (cell.block?.direction) {
            part.classList.add(`direction-${cell.block.direction}`);
          }

          if (cell.block?.id === "shield-block" && cell.powered) {
            part.classList.add("shield-online");
          }

          if (cell.block?.id === "repair-bot-block" && cell.powered) {
            part.classList.add("repair-online");
          }

          if (cell.block?.id === "salvage-collector" && cell.powered) {
            part.classList.add("salvage-online");
          }

          if (isEngineTile(cell.block?.id)) {
            part.classList.toggle("engine-active", activeEngineIds.has(key));
            addDirectionMarker(part, cell.block.direction);
          }

          if (isCannonTile(cell.block?.id)) {
            part.append(createAmmoBadge(cell.block.ammo ?? 0));
          }

          if (isConveyorTile(cell.block?.id) && (cell.block.ammo ?? 0) > 0) {
            part.append(createAmmoBadge(cell.block.ammo));
          }

          if (cell.base?.id === "core") {
            part.classList.add("remote-core-part");
          }

          appendCableUnderlayIndicator(part, cell);
          appendHealthBar(part, getVisibleCellTile(cell));
          ship.append(part);
        }
      }

      worldMap.append(ship);
    }
  }

  function renderTraderShips(worldMap, world, onTargetPoint, renderContext) {
    for (const trader of getRenderableTraders(world)) {
      if (trader.dead) {
        continue;
      }

      if (!isWorldPointVisible(trader.body, renderContext, spaceCore.config.TRADER_TRADE_RADIUS + 260)) {
        continue;
      }

      appendTraderShip(worldMap, trader, onTargetPoint);
    }
  }

  function appendTraderShip(worldMap, trader, onTargetPoint) {
    if (!trader.hostileToPlayer) {
      const tradeRange = document.createElement("span");
      const radius = spaceCore.config.TRADER_TRADE_RADIUS;
      tradeRange.className = "trader-trade-range";
      tradeRange.dataset.traderId = trader.id;
      tradeRange.style.left = `${trader.body.x}px`;
      tradeRange.style.top = `${trader.body.y}px`;
      tradeRange.style.width = `${radius * 2}px`;
      tradeRange.style.height = `${radius * 2}px`;
      worldMap.append(tradeRange);
    }

    const ship = document.createElement("div");
    ship.className = `world-ship trader-ship${trader.hostileToPlayer ? " hostile" : ""}`;
    ship.dataset.traderId = trader.id;
    ship.style.left = `${trader.body.x}px`;
    ship.style.top = `${trader.body.y}px`;
    ship.style.transform = `translate(-50%, -50%) rotate(${trader.body.angle}rad)`;

    const label = document.createElement("span");
    label.className = "trader-label";
    label.textContent = trader.hostileToPlayer ? "Hostile Trader" : trader.name ?? "Trader";
    ship.append(label);

    appendShieldRanges(ship, trader.cells, (cell) => ({
      x: cell.x * spaceCore.config.SHIP_WORLD_SCALE,
      y: cell.y * spaceCore.config.SHIP_WORLD_SCALE,
    }));

    for (const cell of trader.cells) {
      const part = document.createElement("button");
      const key = `${cell.x},${cell.y}`;
      part.className = getWorldShipPartClass(cell);
      part.type = "button";
      part.title = cell.base?.id === "core" ? `${trader.name ?? "Trader"} core` : `${trader.name ?? "Trader"} ship part`;
      part.dataset.partKey = key;
      part.style.left = `${cell.x * spaceCore.config.SHIP_WORLD_SCALE}px`;
      part.style.top = `${cell.y * spaceCore.config.SHIP_WORLD_SCALE}px`;
      part.addEventListener("click", (event) => {
        event.stopPropagation();
        onTargetPoint(localToWorld(trader.body, cell.x, cell.y));
      });

      if (cell.block?.direction) {
        part.classList.add(`direction-${cell.block.direction}`);
      }

      if (cell.block?.id === "shield-block" && cell.powered) {
        part.classList.add("shield-online");
      }

      if (cell.block?.id === "repair-bot-block" && cell.powered) {
        part.classList.add("repair-online");
      }

      if (cell.block?.id === "salvage-collector" && cell.powered) {
        part.classList.add("salvage-online");
      }

      if (isEngineTile(cell.block?.id)) {
        part.classList.toggle("engine-active", trader.activeEngines.has(key));
        addDirectionMarker(part, cell.block.direction);
      }

      if (isCannonTile(cell.block?.id)) {
        part.append(createAmmoBadge(cell.block.ammo ?? 0));
      }

      if (cell.base?.id === "core") {
        part.classList.add("trader-core-part");
      }

      appendCableUnderlayIndicator(part, cell);
      appendHealthBar(part, getVisibleCellTile(cell));
      ship.append(part);
    }

    worldMap.append(ship);
  }

  function createPlayerShipPart({
    cell,
    key,
    selectedEngineIds,
    activeEngineIds,
    selectedWeaponIds,
    onSelectEngine,
    onSelectWeapon,
  }) {
    const blockId = cell.block?.id;
    const isEngine = isEngineTile(blockId);
    const isWeapon = isWeaponTile(blockId);
    const part = document.createElement(isEngine || isWeapon ? "button" : "span");

    part.className = getWorldShipPartClass(cell);
    part.dataset.partKey = key;

    if (isEngine || isWeapon) {
      part.type = "button";
      part.classList.add("selectable");
    }

    if (cell.block?.direction) {
      part.classList.add(`direction-${cell.block.direction}`);
    }

    if (blockId === "shield-block" && cell.powered) {
      part.classList.add("shield-online");
    }

    if (blockId === "repair-bot-block" && cell.powered) {
      part.classList.add("repair-online");
    }

    if (blockId === "salvage-collector" && cell.powered) {
      part.classList.add("salvage-online");
    }

    if (isEngine) {
      part.title = formatTileName(blockId);
      part.classList.toggle("selected", selectedEngineIds.has(key));
      part.classList.toggle("engine-active", activeEngineIds.has(key));
      addDirectionMarker(part, cell.block.direction);
      part.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectEngine(key);
      });
    }

    if (isWeapon) {
      part.title = formatTileName(blockId);
      part.classList.toggle("selected", selectedWeaponIds.has(key));

      if (isCannonTile(blockId)) {
        part.append(createAmmoBadge(cell.block.ammo ?? 0));
      }

      part.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectWeapon(key);
      });
    }

    if (isConveyorTile(blockId) && (cell.block.ammo ?? 0) > 0) {
      part.append(createAmmoBadge(cell.block.ammo));
    }

    appendCableUnderlayIndicator(part, cell);
    appendHealthBar(part, getVisibleCellTile(cell));
    return part;
  }

  function appendShieldRanges(ship, cellsOrBoard, getPosition) {
    const radius = spaceCore.config.SHIELD_RADIUS_CELLS * spaceCore.config.SHIP_WORLD_SCALE;

    forEachCell(cellsOrBoard, (cell) => {
      if (cell.block?.id !== "shield-block" || !cell.powered || getHealthRatio(cell.block) <= 0) {
        return;
      }

      const position = getPosition(cell);
      const range = document.createElement("span");
      const ratio = getShieldChargeRatio(cell.block);
      range.className = "world-shield-range";
      range.dataset.shieldKey = `${cell.x},${cell.y}`;
      range.style.left = `${position.x}px`;
      range.style.top = `${position.y}px`;
      range.style.width = `${radius * 2}px`;
      range.style.height = `${radius * 2}px`;

      if (ratio <= 0) {
        range.classList.add("collapsed");
      } else if (ratio <= 0.33) {
        range.classList.add("critical");
      } else if (ratio <= 0.66) {
        range.classList.add("weak");
      }

      ship.append(range);
    });
  }

  function forEachCell(cellsOrBoard, callback) {
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

  function getVisibleCellTile(cell) {
    if (cell.base?.id === "core") {
      return cell.base;
    }

    if (cell.block) {
      return cell.block;
    }

    if (cell.base?.id === "ship-scaffold") {
      return cell.base;
    }

    return cell.underlay;
  }

  function getWorldShipPartClass(cell) {
    if (cell.base?.id === "core") {
      return "world-ship-part core";
    }

    if (cell.block) {
      return `world-ship-part ${cell.block.id}`;
    }

    if (cell.base?.id === "ship-scaffold") {
      return "world-ship-part ship-scaffold";
    }

    if (cell.underlay) {
      return "world-ship-part electric-cable";
    }

    return "world-ship-part ship-scaffold";
  }

  function renderEnemyShip(worldMap, world, onTargetPoint, renderContext) {
    const enemies = getRenderableEnemies(world);

    for (const enemy of enemies) {
      if (enemy.dead) {
        continue;
      }

      if (isWorldPointVisible(enemy.body, renderContext, 320)) {
        appendEnemyShip(worldMap, enemy, onTargetPoint);
      }
    }
  }

  function appendEnemyShip(worldMap, enemy, onTargetPoint) {
    const ship = document.createElement("div");
    ship.className = "world-ship enemy-ship";
    ship.dataset.enemyId = enemy.id ?? "enemy";
    ship.style.left = `${enemy.body.x}px`;
    ship.style.top = `${enemy.body.y}px`;
    ship.style.transform = `translate(-50%, -50%) rotate(${enemy.body.angle}rad)`;
    appendShieldRanges(ship, enemy.cells, (cell) => ({
      x: cell.x * spaceCore.config.SHIP_WORLD_SCALE,
      y: cell.y * spaceCore.config.SHIP_WORLD_SCALE,
    }));

    for (const cell of enemy.cells) {
      const part = document.createElement("button");
      const key = `${cell.x},${cell.y}`;
      part.className = getWorldShipPartClass(cell);
      part.type = "button";
      part.title = cell.base?.id === "core" ? "Enemy core" : "Enemy ship part";
      part.dataset.partKey = key;
      part.style.left = `${cell.x * spaceCore.config.SHIP_WORLD_SCALE}px`;
      part.style.top = `${cell.y * spaceCore.config.SHIP_WORLD_SCALE}px`;
      part.addEventListener("click", (event) => {
        event.stopPropagation();
        onTargetPoint(localToWorld(enemy.body, cell.x, cell.y));
      });

      if (isEngineTile(cell.block?.id)) {
        part.classList.toggle("engine-active", enemy.activeEngines.has(key));
        addDirectionMarker(part, cell.block.direction);
      }

      if (isCannonTile(cell.block?.id)) {
        part.append(createAmmoBadge(cell.block.ammo ?? 0));
      }

      if (cell.base?.id === "core") {
        part.classList.add("enemy-core-part");
      }

      appendCableUnderlayIndicator(part, cell);
      appendHealthBar(part, getVisibleCellTile(cell));
      ship.append(part);
    }

    worldMap.append(ship);
  }

  function getRenderableEnemies(world) {
    if (Array.isArray(world.enemies)) {
      return world.enemies;
    }

    return world.enemy ? [world.enemy] : [];
  }

  function getRenderableTraders(world) {
    if (!Array.isArray(world.traders)) {
      return [];
    }

    return world.traders.slice(0, spaceCore.config.WORLD_MAX_TRADERS ?? world.traders.length);
  }

  function renderWorldPieces(worldMap, world, tiles, renderContext) {
    for (const piece of world.pieces) {
      if (piece.collected || piece.destroyed) {
        continue;
      }

      if (isWorldPointVisible(piece, renderContext, 120)) {
        appendWorldPiece(worldMap, piece, tiles);
      }
    }
  }

  function appendWorldPiece(worldMap, piece, tiles) {
    const tile = tiles.find((item) => item.id === piece.tileId);
    const pieceElement = document.createElement("span");
    pieceElement.className = `world-piece ${piece.connectedToCore ? "core-linked" : "loose"} ${piece.tileId}`;
    pieceElement.dataset.pieceId = piece.id;
    pieceElement.style.left = `${piece.x}px`;
    pieceElement.style.top = `${piece.y}px`;
    pieceElement.title = piece.tileId === "scrap"
      ? `${piece.scrap ?? 0} scrap`
      : tile?.name ?? piece.tileId;

    if (piece.tileId !== "scrap") {
      appendHealthBar(pieceElement, piece);
    }

    worldMap.append(pieceElement);
  }

  function renderWeaponTarget(worldMap, weaponTarget, renderContext) {
    if (!worldMap || !weaponTarget) {
      return;
    }

    if (!isWorldPointVisible(weaponTarget, renderContext, 240)) {
      return;
    }

    const marker = document.createElement("span");
    marker.className = "weapon-target-marker";
    marker.style.left = `${weaponTarget.x}px`;
    marker.style.top = `${weaponTarget.y}px`;
    worldMap.append(marker);
  }

  function updateWorldMotion({ dom, world, board, tiles, inventory, worldStats, worldZoom, remotePlayers = [], onTargetPoint = () => {} }) {
    dom.worldCargoValue.textContent = getCargoCount(inventory, tiles);
    dom.worldRangeValue.textContent = worldStats.reach;
    dom.worldSpeedValue.textContent = worldStats.speed;
    dom.activeEnginesCount.textContent = worldStats.activeEngines;
    dom.enemyCoreStatus.textContent = worldStats.enemyCoreOnline ? `${worldStats.liveEnemies ?? 1} online` : "down";

    const worldSpace = dom.worldMap.querySelector(".world-space");
    if (!worldSpace) {
      return;
    }

    const renderContext = updateWorldCamera(dom.worldMap, worldSpace, world, worldZoom);

    updateShipTransform(worldSpace?.querySelector(".player-ship"), world.ship);
    updateBoardAmmoBadges(worldSpace?.querySelector(".player-ship"), board);
    updateBoardHealthBars(worldSpace?.querySelector(".player-ship"), board);
    updateShieldRangeClasses(worldSpace?.querySelector(".player-ship"), board);

    for (const player of remotePlayers) {
      if (!player?.body) {
        continue;
      }

      const remoteShip = worldSpace?.querySelector(`.remote-player-ship[data-player-id="${player.id}"]`);
      if (!isWorldPointVisible(player.body, renderContext, 240)) {
        remoteShip?.remove();
        continue;
      }

      updateShipTransform(remoteShip, player.body);
      updateEnemyEngineStates(remoteShip, new Set(player.activeEngineIds ?? []));
      updateBoardAmmoBadges(remoteShip, player.board);
      updateBoardHealthBars(remoteShip, player.board);
      updateShieldRangeClasses(remoteShip, player.board);
    }

    const liveEnemyIds = new Set();

    for (const enemy of getRenderableEnemies(world)) {
      if (enemy.dead) {
        continue;
      }

      const enemyId = enemy.id ?? "enemy";
      const enemyShip = worldSpace?.querySelector(`.enemy-ship[data-enemy-id="${enemyId}"]`);

      if (!isWorldPointVisible(enemy.body, renderContext, 320)) {
        enemyShip?.remove();
        continue;
      }

      liveEnemyIds.add(enemyId);

      if (!enemyShip) {
        appendEnemyShip(worldSpace, enemy, onTargetPoint);
        continue;
      }

      updateShipTransform(enemyShip, enemy.body);
      updateEnemyEngineStates(enemyShip, enemy.activeEngines);
      updateCellAmmoBadges(enemyShip, enemy.cells);
      updateCellHealthBars(enemyShip, enemy.cells);
      updateShieldRangeClasses(enemyShip, enemy.cells);
    }

    worldSpace?.querySelectorAll(".enemy-ship").forEach((enemyShip) => {
      if (!liveEnemyIds.has(enemyShip.dataset.enemyId)) {
        enemyShip.remove();
      }
    });

    const liveTraderIds = new Set();

    for (const trader of getRenderableTraders(world)) {
      if (trader.dead) {
        continue;
      }

      const traderShip = worldSpace?.querySelector(`.trader-ship[data-trader-id="${trader.id}"]`);
      const tradeRange = worldSpace?.querySelector(`.trader-trade-range[data-trader-id="${trader.id}"]`);

      if (!isWorldPointVisible(trader.body, renderContext, spaceCore.config.TRADER_TRADE_RADIUS + 260)) {
        traderShip?.remove();
        tradeRange?.remove();
        continue;
      }

      liveTraderIds.add(trader.id);

      if (!traderShip) {
        appendTraderShip(worldSpace, trader, onTargetPoint);
        continue;
      }

      updateShipTransform(traderShip, trader.body);
      updateTradeRangeTransform(tradeRange, trader);
      updateEnemyEngineStates(traderShip, trader.activeEngines);
      updateCellAmmoBadges(traderShip, trader.cells);
      updateCellHealthBars(traderShip, trader.cells);
      updateShieldRangeClasses(traderShip, trader.cells);
      traderShip?.classList.toggle("hostile", Boolean(trader.hostileToPlayer));
      const label = traderShip?.querySelector(".trader-label");

      if (label) {
        label.textContent = trader.hostileToPlayer ? "Hostile Trader" : trader.name ?? "Trader";
      }
    }

    worldSpace?.querySelectorAll(".trader-ship").forEach((traderShip) => {
      if (!liveTraderIds.has(traderShip.dataset.traderId)) {
        traderShip.remove();
      }
    });

    worldSpace?.querySelectorAll(".trader-trade-range").forEach((tradeRange) => {
      if (!liveTraderIds.has(tradeRange.dataset.traderId)) {
        tradeRange.remove();
      }
    });

    const livePieceIds = new Set();

    for (const piece of world.pieces) {
      const pieceElement = worldSpace?.querySelector(`[data-piece-id="${piece.id}"]`);

      if (piece.collected || piece.destroyed || !isWorldPointVisible(piece, renderContext, 120)) {
        pieceElement?.remove();
        continue;
      }

      livePieceIds.add(piece.id);

      if (!pieceElement) {
        appendWorldPiece(worldSpace, piece, tiles);
        continue;
      }

      if (piece.tileId !== "scrap") {
        updatePartHealthBar(pieceElement, piece);
      }
    }

    worldSpace?.querySelectorAll(".world-piece").forEach((pieceElement) => {
      if (!livePieceIds.has(pieceElement.dataset.pieceId)) {
        pieceElement.remove();
      }
    });

    worldSpace?.querySelectorAll(".weapon-effect").forEach((effect) => effect.remove());
    renderWeaponEffects(worldSpace, world, renderContext);
    worldSpace?.querySelectorAll(".projectile").forEach((projectile) => projectile.remove());
    renderProjectiles(worldSpace, world, renderContext);
  }

  function updateTradeRangeTransform(tradeRange, trader) {
    if (!tradeRange) {
      return;
    }

    tradeRange.style.left = `${trader.body.x}px`;
    tradeRange.style.top = `${trader.body.y}px`;
    tradeRange.classList.toggle("hidden", Boolean(trader.hostileToPlayer));
  }

  function updateBoardAmmoBadges(shipElement, board) {
    if (!shipElement || !board) {
      return;
    }

    for (const row of board) {
      for (const cell of row) {
        updatePartAmmoBadge(
          shipElement.querySelector(`[data-part-key="${cell.x},${cell.y}"]`),
          cell.block,
        );
      }
    }
  }

  function updateCellAmmoBadges(shipElement, cells) {
    if (!shipElement || !cells) {
      return;
    }

    for (const cell of cells) {
      updatePartAmmoBadge(
        shipElement.querySelector(`[data-part-key="${cell.x},${cell.y}"]`),
        cell.block,
      );
    }
  }

  function updateBoardHealthBars(shipElement, board) {
    if (!shipElement || !board) {
      return;
    }

    for (const row of board) {
      for (const cell of row) {
        updatePartHealthBar(
          shipElement.querySelector(`[data-part-key="${cell.x},${cell.y}"]`),
          getVisibleCellTile(cell),
        );
      }
    }
  }

  function updateCellHealthBars(shipElement, cells) {
    if (!shipElement || !cells) {
      return;
    }

    for (const cell of cells) {
      updatePartHealthBar(
        shipElement.querySelector(`[data-part-key="${cell.x},${cell.y}"]`),
        getVisibleCellTile(cell),
      );
    }
  }

  function updatePartHealthBar(part, healthSource) {
    if (!part) {
      return;
    }

    part.querySelector(".health-bar")?.remove();
    part.classList.remove("has-health");
    appendHealthBar(part, healthSource);
  }

  function updateShieldRangeClasses(shipElement, cellsOrBoard) {
    if (!shipElement) {
      return;
    }

    forEachCell(cellsOrBoard, (cell) => {
      if (cell.block?.id !== "shield-block") {
        return;
      }

      const range = shipElement.querySelector(`[data-shield-key="${cell.x},${cell.y}"]`);

      if (!range) {
        return;
      }

      const ratio = getShieldChargeRatio(cell.block);

      range.classList.toggle("collapsed", !cell.powered || ratio <= 0);
      range.classList.toggle("weak", ratio > 0.33 && ratio <= 0.66);
      range.classList.toggle("critical", ratio > 0 && ratio <= 0.33);
    });
  }

  function updatePartAmmoBadge(part, block) {
    if (!part) {
      return;
    }

    const ammo = block?.ammo ?? 0;
    const shouldShow = isCannonTile(block?.id) || (isConveyorTile(block?.id) && ammo > 0);
    const badge = part.querySelector(".ammo-badge");

    if (!shouldShow) {
      badge?.remove();
      return;
    }

    if (badge) {
      badge.textContent = ammo;
    } else {
      part.append(createAmmoBadge(ammo));
    }
  }

  function updateWorldCamera(worldMap, worldSpace, world, worldZoom, renderContext = createWorldRenderContext(worldMap, world, worldZoom)) {
    if (!worldMap || !worldSpace) {
      return renderContext;
    }

    const zoom = worldZoom ?? 1;
    const centerX = worldMap.clientWidth / 2;
    const centerY = worldMap.clientHeight / 2;
    updateWorldBackdrop(worldMap, worldSpace, world, zoom, renderContext);
    syncWorldZones(worldSpace, renderContext);
    worldSpace.style.transform = [
      `translate(${centerX}px, ${centerY}px)`,
      `rotate(${-world.ship.angle}rad)`,
      `scale(${zoom})`,
      `translate(${-world.ship.x}px, ${-world.ship.y}px)`,
    ].join(" ");
    return renderContext;
  }

  function updateWorldBackdrop(worldMap, worldSpace, world, zoom, renderContext) {
    const backdrop = worldSpace.querySelector(".world-backdrop");

    if (!backdrop) {
      return;
    }

    const viewportDiagonal = Math.hypot(worldMap.clientWidth, worldMap.clientHeight);
    const desiredSize = Math.ceil(viewportDiagonal / Math.max(0.2, zoom) + 760);
    const size = Math.min(3600, Math.max(1400, desiredSize));
    const center = renderContext?.center ?? world.ship;
    backdrop.style.left = `${center.x - size / 2}px`;
    backdrop.style.top = `${center.y - size / 2}px`;
    backdrop.style.width = `${size}px`;
    backdrop.style.height = `${size}px`;
  }

  function updateShipTransform(shipElement, body) {
    if (!shipElement) {
      return;
    }

    shipElement.style.left = `${body.x}px`;
    shipElement.style.top = `${body.y}px`;
    shipElement.style.transform = `translate(-50%, -50%) rotate(${body.angle}rad)`;
  }

  function updateEnemyEngineStates(enemyShip, activeEngineIds) {
    if (!enemyShip) {
      return;
    }

    enemyShip.querySelectorAll(".world-ship-part.engine, .world-ship-part.overdrive-engine, .world-ship-part.quantum-thruster").forEach((part) => {
      part.classList.toggle("engine-active", activeEngineIds.has(part.dataset.partKey));
    });
  }

  function renderWeaponEffects(worldMap, world, renderContext) {
    if (!worldMap) {
      return;
    }

    for (const effect of world.weaponEffects) {
      if (!isWorldSegmentVisible(effect, renderContext)) {
        continue;
      }

      const beam = document.createElement("span");
      const length = Math.hypot(effect.x2 - effect.x1, effect.y2 - effect.y1);
      const angle = Math.atan2(effect.y2 - effect.y1, effect.x2 - effect.x1);

      beam.className = `weapon-effect ${effect.kind}`;
      beam.style.left = `${effect.x1}px`;
      beam.style.top = `${effect.y1}px`;
      beam.style.width = `${length}px`;
      beam.style.transform = `rotate(${angle}rad)`;
      worldMap.append(beam);
    }
  }

  function renderProjectiles(worldMap, world, renderContext) {
    if (!worldMap) {
      return;
    }

    for (const projectile of world.projectiles) {
      if (!isWorldPointVisible(projectile, renderContext, 160)) {
        continue;
      }

      const projectileElement = document.createElement("span");
      projectileElement.className = `projectile cannon-projectile ${projectile.tileId ?? "cannon"}`;
      projectileElement.style.left = `${projectile.x}px`;
      projectileElement.style.top = `${projectile.y}px`;
      worldMap.append(projectileElement);
    }
  }

  function createAmmoBadge(ammo) {
    const badge = document.createElement("span");
    badge.className = "ammo-badge";
    badge.textContent = ammo;
    return badge;
  }

  function appendCableUnderlayIndicator(container, cell) {
    if (cell.underlay?.id !== "electric-cable" || (!cell.base && !cell.block)) {
      return;
    }

    const indicator = document.createElement("span");
    indicator.className = "cable-underlay-indicator";
    container.classList.add("has-cable-underlay");
    container.append(indicator);
  }

  function appendHealthBar(container, healthSource) {
    const ratio = getHealthRatio(healthSource);

    if (ratio <= 0 || ratio >= 1) {
      return;
    }

    const bar = document.createElement("span");
    const fill = document.createElement("span");
    bar.className = `health-bar ${getHealthColorClass(ratio)}`;
    fill.className = "health-fill";
    fill.style.width = `${Math.round(ratio * 100)}%`;
    bar.append(fill);
    container.classList.add("has-health");
    container.append(bar);
  }

  function getHealthRatio(healthSource) {
    if (!healthSource || typeof healthSource.hp !== "number" || typeof healthSource.maxHp !== "number") {
      return 1;
    }

    if (healthSource.maxHp <= 0) {
      return 1;
    }

    return Math.max(0, Math.min(1, healthSource.hp / healthSource.maxHp));
  }

  function getShieldChargeRatio(block) {
    if (!block || getHealthRatio(block) <= 0) {
      return 0;
    }

    const maxHp = Number.isFinite(block.shieldMaxHp) && block.shieldMaxHp > 0
      ? block.shieldMaxHp
      : block.maxHp;
    const hp = Number.isFinite(block.shieldHp) ? block.shieldHp : maxHp;

    if (!Number.isFinite(maxHp) || maxHp <= 0) {
      return 1;
    }

    return Math.max(0, Math.min(1, hp / maxHp));
  }

  function getHealthColorClass(ratio) {
    if (ratio > 0.5) {
      return "healthy";
    }

    if (ratio > 0.25) {
      return "wounded";
    }

    return "critical";
  }

  function addDirectionMarker(part, direction = "up") {
    part.classList.add(`direction-${direction}`);
    const marker = document.createElement("span");
    marker.className = "direction-marker";
    part.append(marker);
  }

  function worldToLocalOffset(body, point) {
    const dx = point.x - body.x;
    const dy = point.y - body.y;
    const cos = Math.cos(-body.angle);
    const sin = Math.sin(-body.angle);

    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
    };
  }

  function localToWorld(body, localX, localY) {
    const scaledX = localX * spaceCore.config.SHIP_WORLD_SCALE;
    const scaledY = localY * spaceCore.config.SHIP_WORLD_SCALE;
    const cos = Math.cos(body.angle);
    const sin = Math.sin(body.angle);

    return {
      x: body.x + scaledX * cos - scaledY * sin,
      y: body.y + scaledX * sin + scaledY * cos,
    };
  }

  function getCargoCount(inventory, tiles) {
    return tiles.reduce((total, tile) => {
      if (tile.locked) {
        return total;
      }

      return total + (inventory[tile.id] ?? 0);
    }, 0);
  }

  function isTileResearchLocked(tile, unlockedTechIds = new Set()) {
    return Boolean(tile?.researchId && !unlockedTechIds.has(tile.researchId));
  }

  function isWeaponTile(tileId) {
    return spaceCore.config.WEAPON_TILE_IDS.includes(tileId);
  }

  function isCannonTile(tileId) {
    return spaceCore.config.CANNON_TILE_IDS.includes(tileId);
  }

  function isConveyorTile(tileId) {
    return spaceCore.config.CONVEYOR_TILE_IDS.includes(tileId);
  }

  function isEngineTile(tileId) {
    return spaceCore.config.ENGINE_TILE_IDS.includes(tileId);
  }

  function canAffordResearch(project, scrap, inventory) {
    if (scrap < project.scrap) {
      return false;
    }

    return Object.entries(project.parts ?? {}).every(([tileId, count]) => (
      (inventory[tileId] ?? 0) >= count
    ));
  }

  function formatResearchCost(project, tiles) {
    const parts = Object.entries(project.parts ?? {}).map(([tileId, count]) => {
      const tile = tiles.find((candidate) => candidate.id === tileId);
      return `${count} ${tile?.name ?? formatTileName(tileId)}`;
    });

    return [...parts, `${project.scrap} scrap`].join(", ");
  }

  function formatTileName(tileId) {
    return String(tileId ?? "")
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function setStatus(dom, message, type) {
    dom.statusElement.textContent = message;
    dom.statusElement.className = "status-bar";

    if (type) {
      dom.statusElement.classList.add(type);
    }
  }

  spaceCore.renderers = {
    renderPalette,
    renderBoard,
    renderInspector,
    renderInventory,
    renderTradeMenu,
    renderTechTree,
    renderStats,
    renderWorld,
    updateWorldMotion,
    setStatus,
  };
})(window.SpaceCore = window.SpaceCore || {});
