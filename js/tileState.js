(function (spaceCore) {
  "use strict";

  const { TILE_MAX_HP } = spaceCore.config;

  function createTileState(tileId, extra = {}) {
    return ensureTileHealth({
      id: tileId,
      ...extra,
    });
  }

  function ensureTileHealth(tile) {
    if (!tile?.id) {
      return tile;
    }

    const maxHp = tile.maxHp ?? getTileMaxHp(tile.id);
    tile.maxHp = maxHp;

    if (typeof tile.hp !== "number") {
      tile.hp = maxHp;
    }

    tile.hp = Math.max(0, Math.min(tile.hp, maxHp));
    return tile;
  }

  function getTileMaxHp(tileId) {
    return TILE_MAX_HP[tileId] ?? 50;
  }

  function getHealthRatio(tile) {
    ensureTileHealth(tile);
    return tile?.maxHp > 0 ? tile.hp / tile.maxHp : 1;
  }

  function isTileDamaged(tile) {
    ensureTileHealth(tile);
    return Boolean(tile && tile.hp > 0 && tile.hp < tile.maxHp);
  }

  spaceCore.tileState = {
    createTileState,
    ensureTileHealth,
    getTileMaxHp,
    getHealthRatio,
    isTileDamaged,
  };
})(window.SpaceCore = window.SpaceCore || {});
