(function (spaceCore) {
  "use strict";

  const {
    AMMO_FACTORY_TILE_IDS,
    CANNON_STARTING_AMMO,
    CANNON_TILE_IDS,
    CONVEYOR_TILE_IDS,
    DIRECTIONS,
  } = spaceCore.config;
  const { getCell, isBaseConnected } = spaceCore.boardModel;
  const { createTileState } = spaceCore.tileState;

  function validatePlacement({ board, x, y, tile, inventory, eraseMode }) {
    const cell = getCell(board, x, y);

    if (!cell) {
      return { ok: false, message: "Outside construction grid." };
    }

    if (eraseMode) {
      return { ok: true, message: "Remove top tile." };
    }

    if (tile.locked) {
      return { ok: false, message: "Core is already installed." };
    }

    if ((inventory[tile.id] ?? 0) < 1) {
      return { ok: false, message: `No stored ${tile.name} pieces.` };
    }

    if (tile.layer === "base") {
      if (cell.base) {
        return { ok: false, message: "Base space occupied." };
      }

      if (!isBaseConnected(board, x, y)) {
        return { ok: false, message: "Scaffold needs an adjacent ship base." };
      }

      return { ok: true, message: "Scaffold can be placed." };
    }

    if (tile.layer === "block") {
      if (cell.base?.id !== "ship-scaffold") {
        return { ok: false, message: "Blocks need ship scaffold." };
      }

      if (cell.block) {
        return { ok: false, message: "Block space occupied." };
      }

      return { ok: true, message: `${tile.name} can be placed.` };
    }

    if (tile.layer === "underlay") {
      if (!cell.base && !cell.block) {
        return { ok: false, message: "Underlay needs a ship tile." };
      }

      if (cell.underlay) {
        return { ok: false, message: "Underlay space occupied." };
      }

      return { ok: true, message: "Cable can be placed." };
    }

    return { ok: false, message: "Unknown tile." };
  }

  function createPlacedTile(tile, directionIndex) {
    const placedTile = createTileState(tile.id);

    if (tile.rotatable) {
      placedTile.direction = DIRECTIONS[directionIndex];
    }

    if (CANNON_TILE_IDS.includes(tile.id)) {
      placedTile.ammo = CANNON_STARTING_AMMO;
    }

    if (AMMO_FACTORY_TILE_IDS.includes(tile.id)) {
      placedTile.ammoProgress = 0;
    }

    if (CONVEYOR_TILE_IDS.includes(tile.id)) {
      placedTile.ammo = 0;
      placedTile.ammoProgress = 0;
    }

    return placedTile;
  }

  spaceCore.placementRules = {
    validatePlacement,
    createPlacedTile,
  };
})(window.SpaceCore = window.SpaceCore || {});
