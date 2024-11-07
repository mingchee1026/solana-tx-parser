import { Connection } from "@solana/web3.js";
import dotenv from "dotenv";
import { extractJupiterSwap } from "./jupiter";
import { extractRaydiumSwap } from "./raydium";

dotenv.config();

const parseTransaction = async (signature: string) => {
  const rpc = process.env.RPC_ENDPOINT;

  const connection = new Connection(rpc); // Use your own RPC endpoint here.
  const tx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });

  if (tx.meta.err) {
    console.log("Failed transaction", tx.meta.err);
  }

  // const result = await extractJupiterSwap(
  //   signature,
  //   connection,
  //   tx,
  //   tx.blockTime
  // );

  const result = await extractRaydiumSwap(
    signature,
    connection,
    tx,
    tx.blockTime
  );

  console.table(result);
};

const signature =
  // "2XmXoZPviL4cz8HWYwAbVdYP1FjEb9zQyobUcKWQNgHt25NMuDkcoyHaepxxwSxEFqao1ZemX4uQeboBZWfWGTrX"; // jupiter
  // "3XhiPP55aNkTEsNLtWGkfBi1ka44WC8Ey51h1FhczFYTzv1uEvxcFcqKFVdanskuCzzw3RE3yEmHkvc367Q58Ykq";
  // "4yxjjZF4qtc97RBv1itzetSorskNKoHg4fDnBDQGTy18rpZy53SDKBwCQGQDu5TaimtfLuS1GR1zNASzHXVmQ6Jf"; // raydium sell
  "2Db7syrJPp3jwKZ6phXJb2ibhhL7K7NR5XU45xXz1DxCw7WvA6cpxsooE6wfQ4LPCPDxshpkMoHp4fQZ8VPjo1qV"; // raydium buy

parseTransaction(signature);
