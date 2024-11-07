import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  VersionedTransactionResponse,
  ParsedInstruction,
  PartiallyDecodedInstruction,
  TransactionInstruction,
} from "@solana/web3.js";
import { struct, u8 } from "@solana/buffer-layout";
import * as base58 from "bs58";
import { TransactionFormatter } from "./utils/transaction-formatter";
import { RaydiumAmmParser } from "./utils/raydium-amm-parser";

const TXN_FORMATTER = new TransactionFormatter();
const RAYDIUM_PARSER = new RaydiumAmmParser();
const RAYDIUM_PUBLIC_KEY = RaydiumAmmParser.PROGRAM_ID;
const PUMP_FUN_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);

// it represent the person who extract/put the sol/token to the pool for every raydium swap txn
export const RAYDIUM_AUTHORITY = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";
export const WSOL = "So11111111111111111111111111111111111111112";

export async function extractRaydiumSwap(
  signature: string,
  connection: Connection,
  tx: any,
  blockTime?: number
) {
  decodeRaydiumTxn(tx);

  const { ca, signer } = getMintToken(tx);
  const result = await checkTraderBuyOrSell(tx, signer);

  return result;
}

// subscribeCommand(client, req);

function decodeRaydiumTxn(tx: ParsedTransactionWithMeta) {
  if (tx.meta?.err) return;

  const events = getEvents(tx);

  console.log(events);

  return events;
}

function getEvents(transactionResponse: ParsedTransactionWithMeta) {
  let events = [];

  if (transactionResponse.transaction.message) {
    let { message } = transactionResponse.transaction;

    message.instructions?.map(async (ix) => {
      if (!ix.programId.equals(RAYDIUM_PUBLIC_KEY)) return;
      if (!("data" in ix)) return; // Guard in case it is a parsed decoded instruction

      const instructionData = Buffer.from(base58.default.decode(ix.data));
      const instructionType = u8().decode(instructionData);

      let event;
      if (instructionType === 9) {
        event = RAYDIUM_PARSER.parseRaydiumSwapIn1(
          instructionData,
          ix.programId
        );
      }
      if (instructionType === 11) {
        event = RAYDIUM_PARSER.parseRaydiumSwapOut1(
          instructionData,
          ix.programId
        );
      }

      events.push(event);
    });
  }

  return events;
}

async function checkTraderBuyOrSell(data: any, traderAddress: string) {
  const preTokenBalances = data.meta.preTokenBalances; // data.transaction.transaction.meta.preTokenBalances;
  const postTokenBalances = data.meta.postTokenBalances; // data.transaction.transaction.meta.postTokenBalances;
  let targetToken = "",
    postPoolSOL = 0,
    postPoolToken = 0,
    prePoolSOL = 0,
    prePoolToken = 0,
    side = "";
  // look for the token that the trader is buying or selling
  for (const account of preTokenBalances) {
    if (targetToken !== "" && prePoolSOL !== 0 && prePoolToken !== 0) break; // make sure we get the target token and pool sol balances and trader address only
    if (account.owner === RAYDIUM_AUTHORITY && account.mint !== WSOL)
      targetToken = account.mint;
    if (account.owner === RAYDIUM_AUTHORITY && account.mint === WSOL) {
      prePoolSOL = account.uiTokenAmount.uiAmount;
    }
    if (account.owner === RAYDIUM_AUTHORITY && account.mint !== WSOL) {
      prePoolToken = account.uiTokenAmount.uiAmount;
    }
  }

  for (const account of postTokenBalances) {
    if (postPoolSOL !== 0 && postPoolToken !== 0) break; // make sure we get the target token and pool sol balances and trader address only
    if (account.owner === RAYDIUM_AUTHORITY && account.mint !== WSOL)
      targetToken = account.mint;
    if (account.owner === RAYDIUM_AUTHORITY && account.mint === WSOL) {
      postPoolSOL = account.uiTokenAmount.uiAmount;
    }
    if (account.owner === RAYDIUM_AUTHORITY && account.mint !== WSOL) {
      postPoolToken = account.uiTokenAmount.uiAmount;
    }
  }

  if (targetToken === "") {
    return;
  }

  let swappedSOLAmount = 0,
    swappedTokenAmount = 0;

  if (postPoolSOL > prePoolSOL) {
    side = "buy";
    swappedSOLAmount = postPoolSOL - prePoolSOL;
    swappedTokenAmount = prePoolToken - postPoolToken;
  } else {
    side = "sell";
    swappedSOLAmount = prePoolSOL - postPoolSOL;
    swappedTokenAmount = postPoolToken - prePoolToken;
  }

  const date = new Date((data.blockTime ?? 0) * 1000).toISOString();

  if (side === "buy") {
    // console.info(
    //   `Trader ${traderAddress} is ${side}ing ${swappedTokenAmount} of ${targetToken} using ${swappedSOLAmount} SOL in price of ${
    //     postPoolSOL / postPoolToken
    //   }`
    // );

    console.table({
      DATE: date,
      TYPE: side.toUpperCase(),
      TOKEN: swappedTokenAmount,
      SOL: swappedSOLAmount,
      PRICE: postPoolSOL / postPoolToken,
      MAKER: traderAddress,
    });
  } else {
    // console.info(
    //   `Trader ${traderAddress} is ${side}ing ${swappedTokenAmount} of ${targetToken} for ${swappedSOLAmount} SOL in price of ${
    //     postPoolSOL / postPoolToken
    //   }`
    // );

    return {
      DATE: date,
      TYPE: side.toUpperCase(),
      TOKEN: swappedTokenAmount,
      SOL: swappedSOLAmount,
      PRICE: postPoolSOL / postPoolToken,
      MAKER: traderAddress,
    };
  }
}

function getMintToken(tx) {
  const data: any[] = tx.meta.preTokenBalances;
  const filter = data.filter(
    (t) => t.mint !== "So11111111111111111111111111111111111111112"
  );
  const ca = filter[0].mint;
  const signer = filter[0].owner;
  return {
    ca,
    signer,
  };
}

function getMintTokenB(txn) {}
