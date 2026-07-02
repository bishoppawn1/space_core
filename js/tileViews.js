(function (spaceCore) {
  "use strict";

  const { DIRECTIONS } = spaceCore.config;

  function decorateTilePreview(element, tile, directionIndex, size = "") {
    element.innerHTML = "";
    element.className = `tile-preview ${tile.id}`;

    if (size) {
      element.classList.add(size);
    }

    if (tile.layer === "block") {
      element.classList.add("block-preview");
    }

    if (tile.layer === "underlay") {
      element.classList.add("underlay-preview");
    }

    if (tile.rotatable) {
      element.classList.add(`direction-${DIRECTIONS[directionIndex]}`);
      element.append(createDirectionMarker());
    }
  }

  function createTilePreview(tile, directionIndex, size = "") {
    const preview = document.createElement("span");
    decorateTilePreview(preview, tile, directionIndex, size);
    return preview;
  }

  function createTileLabel(tile) {
    const label = document.createElement("span");
    const name = document.createElement("span");
    const meta = document.createElement("span");

    name.className = "tile-name";
    name.textContent = tile.name;
    meta.className = "tile-meta";
    meta.textContent = tile.layer;
    label.append(name, meta);
    return label;
  }

  function createCostPill(tile) {
    const cost = document.createElement("span");
    cost.className = "cost-pill";
    cost.textContent = tile.locked ? "fixed" : tile.cost;
    return cost;
  }

  function createUnderlayShape() {
    const shape = document.createElement("span");
    shape.className = "underlay-shape";
    return shape;
  }

  function createBaseShape(base) {
    const shape = document.createElement("span");
    shape.className = `base-shape ${base.id}`;
    return shape;
  }

  function createBlockShape(block) {
    const shape = document.createElement("span");
    shape.className = `block-shape ${block.id}`;

    if (block.direction) {
      shape.classList.add(`direction-${block.direction}`);
      shape.append(createDirectionMarker());
    }

    return shape;
  }

  function createDirectionMarker() {
    const marker = document.createElement("span");
    marker.className = "direction-marker";
    return marker;
  }

  spaceCore.tileViews = {
    decorateTilePreview,
    createTilePreview,
    createTileLabel,
    createCostPill,
    createUnderlayShape,
    createBaseShape,
    createBlockShape,
  };
})(window.SpaceCore = window.SpaceCore || {});
