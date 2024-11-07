import dotenv from "dotenv";

dotenv.config();

function sendRequest(ws: WebSocket, address: string[]) {
  const request = {
    jsonrpc: "2.0",
    id: 420,
    method: "transactionSubscribe",
    params: [
      {
        failed: false,
        accountInclude: address,
      },
      {
        commitment: "confirmed",
        encoding: "jsonParsed",
        transactionDetails: "full",
        showRewards: true,
        maxSupportedTransactionVersion: 0,
      },
    ],
  };
  ws.send(JSON.stringify(request));
}

export const websocketData = async (address: string[]) => {
  let ws = new WebSocket(process.env.RPC_WEBSOCKET_ENDPOINT);

  //   cron.schedule("*/10 * * * * *", async () => {
  //     console.log("Running a task every 5 seconds --- updating tokens");
  //   });

  //   solPrice = await readSolPrice();

  ws.on("open", function open() {
    console.log("WebSocket is open");

    sendRequest(ws, address); // Send a request once the WebSocket is open
  });

  ws.on("message", function incoming(data) {
    try {
      const messageStr = data.toString("utf8");
      const message = JSON.parse(messageStr);
      if (message.method === "transactionNotification") {
        let tx = message.params?.result?.transaction;
        if (!tx) return;
      }
    } catch (e) {
      LoggerService.error(e);
    }
  });

  ws.on("error", function error(err) {
    console.error("WebSocket error:", err);
  });

  ws.on("close", function close() {
    console.log("WebSocket is closed");
    // connection closed, discard old websocket and create a new one in 5s
    ws = null;
    setTimeout(() => websocketData(address), 5000);
  });
};
