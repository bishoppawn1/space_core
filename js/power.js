(function (spaceCore) {
  "use strict";

  const { POWER_GENERATOR_TILE_IDS, POWER_OUTPUT_BY_TILE, POWER_REQUIREMENT_BY_TILE, WEAPON_TILE_IDS } = spaceCore.config;
  const { getNeighbors, cellKey } = spaceCore.boardModel;

  function calculatePower(board, unlockedTechIds = new Set()) {
    for (const row of board) {
      for (const cell of row) {
        resetPowerState(cell);
      }
    }

    const visited = new Set();
    let networkId = 0;

    for (const row of board) {
      for (const cell of row) {
        if (!isPowerNode(cell) || visited.has(cellKey(cell))) {
          continue;
        }

        applyPowerNetwork(collectPowerNetwork(board, cell, visited), networkId, unlockedTechIds);
        networkId += 1;
      }
    }

    for (const row of board) {
      for (const cell of row) {
        const requirement = getTilePowerRequirement(cell.block?.id);

        if (requirement > 0 && cell.powerNetworkId === null) {
          cell.powerRequired = requirement;
          cell.powerNetworkRequired = requirement;
        }
      }
    }
  }

  function getStats(board, unlockedTechIds = new Set()) {
    let scaffolds = 0;
    let generators = 0;
    let poweredBlocks = 0;
    let weapons = 0;
    let mass = 1;
    let powerGenerated = 0;
    let powerRequired = 0;

    for (const row of board) {
      for (const cell of row) {
        if (cell.base?.id === "ship-scaffold") {
          scaffolds += 1;
          mass += 1;
        }

        if (cell.block) {
          mass += 2;
        }

        if (POWER_GENERATOR_TILE_IDS.includes(cell.block?.id)) {
          generators += 1;
          powerGenerated += getTilePowerOutput(cell.block.id, unlockedTechIds);
        }

        if (cell.block && getTilePowerRequirement(cell.block.id) > 0) {
          powerRequired += getTilePowerRequirement(cell.block.id);
        }

        if (cell.block && cell.powered && getTilePowerRequirement(cell.block.id) > 0) {
          poweredBlocks += 1;
        }

        if (WEAPON_TILE_IDS.includes(cell.block?.id)) {
          weapons += 1;
        }
      }
    }

    return {
      scaffolds,
      generators,
      poweredBlocks,
      weapons,
      mass,
      power: `${powerGenerated}/${powerRequired}`,
      powerGenerated,
      powerRequired,
    };
  }

  function getPowerOutput(board, unlockedTechIds = new Set()) {
    let power = 0;

    for (const row of board) {
      for (const cell of row) {
        if (POWER_GENERATOR_TILE_IDS.includes(cell.block?.id)) {
          power += getModifiedGeneratorOutput(cell.block.id, unlockedTechIds);
        }
      }
    }

    return power;
  }

  function getModifiedGeneratorOutput(tileId, unlockedTechIds) {
    const baseOutput = POWER_OUTPUT_BY_TILE[tileId] ?? POWER_OUTPUT_BY_TILE["power-generator"] ?? 8;
    let bonus = 0;

    if (unlockedTechIds.has("generator-coils")) {
      bonus += 1;
    }

    if (unlockedTechIds.has("reactor-housing")) {
      bonus += 1;
    }

    if (unlockedTechIds.has("quantum-capacitors")) {
      bonus += 2;
    }

    if (unlockedTechIds.has("plasma-regulators")) {
      bonus += 2;
    }

    return baseOutput + bonus;
  }

  function resetPowerState(cell) {
    cell.powered = false;
    cell.powerNetworkId = null;
    cell.powerNetworkGenerated = 0;
    cell.powerNetworkRequired = 0;
    cell.powerNetworkConsumers = 0;
    cell.powerShare = 0;
    cell.powerRatio = 0;
    cell.powerGenerated = 0;
    cell.powerRequired = 0;
    cell.powerReceived = 0;
  }

  function isPowerNode(cell) {
    return Boolean(cell && (cell.underlay?.id === "electric-cable" || POWER_GENERATOR_TILE_IDS.includes(cell.block?.id)));
  }

  function collectPowerNetwork(board, startCell, visited) {
    const cells = [];
    const queue = [startCell];
    visited.add(cellKey(startCell));

    while (queue.length > 0) {
      const cell = queue.shift();
      cells.push(cell);

      for (const neighbor of getNeighbors(board, cell.x, cell.y)) {
        const key = cellKey(neighbor);

        if (!visited.has(key) && isPowerNode(neighbor)) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }

    return cells;
  }

  function applyPowerNetwork(cells, networkId, unlockedTechIds) {
    const generated = cells.reduce((total, cell) => (
      total + getTilePowerOutput(cell.block?.id, unlockedTechIds)
    ), 0);
    const consumers = cells.filter((cell) => getTilePowerRequirement(cell.block?.id) > 0);
    const required = consumers.reduce((total, cell) => total + getTilePowerRequirement(cell.block.id), 0);
    const share = consumers.length > 0 ? generated / consumers.length : 0;
    const ratio = required > 0 ? Math.min(1, generated / required) : generated > 0 ? 1 : 0;

    for (const cell of cells) {
      const requirement = getTilePowerRequirement(cell.block?.id);
      const output = getTilePowerOutput(cell.block?.id, unlockedTechIds);
      cell.powerNetworkId = networkId;
      cell.powerNetworkGenerated = generated;
      cell.powerNetworkRequired = required;
      cell.powerNetworkConsumers = consumers.length;
      cell.powerShare = share;
      cell.powerRatio = ratio;
      cell.powerGenerated = output;
      cell.powerRequired = requirement;

      if (requirement > 0) {
        cell.powerReceived = requirement * ratio;
        cell.powered = ratio >= 1;
      } else {
        cell.powerReceived = 0;
        cell.powered = generated > 0;
      }
    }
  }

  function getTilePowerOutput(tileId, unlockedTechIds = new Set()) {
    return POWER_GENERATOR_TILE_IDS.includes(tileId)
      ? getModifiedGeneratorOutput(tileId, normalizeTechIds(unlockedTechIds))
      : 0;
  }

  function getTilePowerRequirement(tileId) {
    return POWER_REQUIREMENT_BY_TILE[tileId] ?? 0;
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

  spaceCore.powerSystem = {
    calculatePower,
    getStats,
    getTilePowerOutput,
    getTilePowerRequirement,
  };
})(window.SpaceCore = window.SpaceCore || {});
