import { Connection } from "@solana/web3.js";
import { WebSocket } from "ws";
import dotenv from "dotenv";
import { extractJupiterSwap } from "./jupiter";
import { extractRaydiumSwap } from "./raydium";

dotenv.config();

const rpc = process.env.RPC_ENDPOINT;

const connection = new Connection(rpc); // Use your own RPC endpoint here.

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

export const subscribeTransaction = async (address: string[]) => {
  let ws = new WebSocket(process.env.RPC_WEBSOCKET_ENDPOINT);

  //   cron.schedule("*/10 * * * * *", async () => {
  //     console.log("Running a task every 5 seconds --- updating tokens");
  //   });

  //   solPrice = await readSolPrice();

  ws.on("open", function open() {
    console.log("WebSocket is open");

    // Send a request once the WebSocket is open
    sendRequest(ws, address);
  });

  ws.on("message", async function incoming(data) {
    try {
      const messageStr = data.toString("utf8");
      const message = JSON.parse(messageStr);
      if (message.method === "transactionNotification") {
        const { slot, signature } = message.params.result;

        if (!signature) {
          return;
        }

        const txn = await getTxn(signature);

        console.log(txn);

        if (!txn) {
          return;
        }

        let result = extractJupiterSwap(
          signature,
          connection,
          txn,
          txn.blockTime
        );

        if (!result) {
          result = extractRaydiumSwap(
            signature,
            connection,
            txn,
            txn.blockTime
          );
        }

        console.log(result);
      }
    } catch (e) {
      console.error(e);
    }
  });

  ws.on("error", function error(err) {
    console.error("WebSocket error:", err);
  });

  ws.on("close", function close() {
    console.log("WebSocket is closed");
    // connection closed, discard old websocket and create a new one in 5s
    ws = null;
    setTimeout(() => subscribeTransaction(address), 5000);
  });

  async function getTxn(signature: string) {
    const txn = await connection.getParsedTransaction(signature, {
      // maxSupportedTransactionVersion: 0,
    });

    return txn;
  }
};
