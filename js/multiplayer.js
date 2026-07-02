(function (spaceCore) {
  "use strict";

  function createMultiplayerClient({ onOpen, onClose, onMessage }) {
    let socket = null;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/multiplayer`);

      socket.addEventListener("open", () => {
        onOpen?.();
      });

      socket.addEventListener("message", (event) => {
        try {
          onMessage?.(JSON.parse(event.data));
        } catch (error) {
          onMessage?.({ type: "error", message: "Bad multiplayer packet." });
        }
      });

      socket.addEventListener("close", () => {
        socket = null;
        onClose?.();
      });

      socket.addEventListener("error", () => {
        onMessage?.({ type: "error", message: "Multiplayer connection failed." });
      });
    }

    function send(data) {
      if (socket?.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify(data));
      return true;
    }

    function close() {
      socket?.close();
      socket = null;
    }

    function isOpen() {
      return socket?.readyState === WebSocket.OPEN;
    }

    return {
      close,
      connect,
      isOpen,
      send,
    };
  }

  spaceCore.multiplayer = {
    createMultiplayerClient,
  };
})(window.SpaceCore = window.SpaceCore || {});
