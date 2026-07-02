(function (spaceCore) {
  "use strict";

  const { COLUMNS, ROWS, CORE_X, CORE_Y } = spaceCore.config;
  const { createTileState } = spaceCore.tileState;

  function createBoard() {
    return Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLUMNS }, (_, x) => ({
        x,
        y,
        base: x === CORE_X && y === CORE_Y ? createTileState("core") : null,
        block: null,
        underlay: null,
        powered: false,
      })),
    );
  }

  function getCell(board, x, y) {
    return board[y]?.[x] ?? null;
  }

  function getNeighbors(board, x, y) {
    return [
      getCell(board, x, y - 1),
      getCell(board, x + 1, y),
      getCell(board, x, y + 1),
      getCell(board, x - 1, y),
    ].filter(Boolean);
  }

  function isBaseConnected(board, x, y) {
    return getNeighbors(board, x, y).some((neighbor) => neighbor.base);
  }

  function cellKey(cell) {
    return `${cell.x},${cell.y}`;
  }

  spaceCore.boardModel = {
    createBoard,
    getCell,
    getNeighbors,
    isBaseConnected,
    cellKey,
  };
})(window.SpaceCore = window.SpaceCore || {});
