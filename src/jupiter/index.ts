import { BN, Event, Program, Provider, Wallet } from "@coral-xyz/anchor";
import { unpackAccount, unpackMint } from "@solana/spl-token";
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";
import { InstructionParser } from "./lib/instruction-parser";
import { DecimalUtil, getPriceInUSDByMint } from "./lib/utils";
import { getEvents } from "./lib/get-events";
import { AMM_TYPES, JUPITER_V6_PROGRAM_ID } from "./constants";
import { FeeEvent, SwapEvent, TransactionWithMeta } from "./types";
import { IDL, Jupiter } from "./idl/jupiter";

export { TransactionWithMeta };

export const program = new Program<Jupiter>(
  IDL,
  JUPITER_V6_PROGRAM_ID,
  {} as Provider
);

// it represent the person who extract/put the sol/token to the pool for every raydium swap txn
export const RAYDIUM_AUTHORITY = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";
export const WSOL = "So11111111111111111111111111111111111111112";

type AccountInfoMap = Map<string, AccountInfo<Buffer>>;

export type SwapAttributes = {
  owner: string;
  transferAuthority: string;
  programId: string;
  signature: string;
  timestamp: Date;
  legCount: number;
  volumeInUSD: number;
  inSymbol: string;
  inAmount: BigInt;
  inAmountInDecimal?: number;
  inAmountInUSD: number;
  inMint: string;
  outSymbol: string;
  outAmount: BigInt;
  outAmountInDecimal?: number;
  outAmountInUSD: number;
  outMint: string;
  instruction: string;
  exactInAmount: BigInt;
  exactInAmountInUSD: number;
  exactOutAmount: BigInt;
  exactOutAmountInUSD: number;
  swapData: JSON;
  feeTokenPubkey?: string;
  feeOwner?: string;
  feeSymbol?: string;
  feeAmount?: BigInt;
  feeAmountInDecimal?: number;
  feeAmountInUSD?: number;
  feeMint?: string;
  tokenLedger?: string;
  lastAccount: string; // This can be a tracking account since we don't have a way to know we just log it the last account.
};

const reduceEventData = <T>(events: Event[], name: string) =>
  events.reduce((acc, event) => {
    if (event.name === name) {
      acc.push(event.data as T);
    }
    return acc;
  }, new Array<T>());

export async function extractJupiterTransaction(
  signature: string,
  connection: Connection,
  tx: any, //TransactionWithMeta,
  blockTime?: number
) {
  const programId = JUPITER_V6_PROGRAM_ID;
  const accountInfosMap: AccountInfoMap = new Map();

  const logMessages = tx.meta.logMessages;
  if (!logMessages) {
    throw new Error("Missing log messages...");
  }

  let events = getEvents(program, tx);

  const swapEvents = reduceEventData<SwapEvent>(events, "SwapEvent");
  const feeEvent = reduceEventData<FeeEvent>(events, "FeeEvent")[0];

  if (swapEvents.length === 0) {
    return;
  }

  const accountsToBeFetched = new Array<PublicKey>();
  swapEvents.forEach((swapEvent) => {
    accountsToBeFetched.push(swapEvent.inputMint);
    accountsToBeFetched.push(swapEvent.outputMint);
  });

  if (feeEvent) {
    accountsToBeFetched.push(feeEvent.account);
  }
  const accountInfos = await connection.getMultipleAccountsInfo(
    accountsToBeFetched
  );
  accountsToBeFetched.forEach((account, index) => {
    accountInfosMap.set(account.toBase58(), accountInfos[index]);
  });

  const swapData = await parseSwapEvents(accountInfosMap, swapEvents);

  const wallet = tx.transaction.message.accountKeys[0].pubkey;

  // console.log({
  //   signer: wallet,
  //   swapData,
  // });

  console.log(feeEvent);

  const parser = new InstructionParser(programId);

  const instructions = parser.getInstructions(tx);
  const [initialPositions, finalPositions] =
    parser.getInitialAndFinalSwapPositions(instructions);

  const inSymbol = null; // We don't longer support this.
  const inMint = swapData[initialPositions[0]].inMint;
  const inSwapData = swapData.filter(
    (swap, index) => initialPositions.includes(index) && swap.inMint === inMint
  );
  const inAmount = inSwapData.reduce((acc, curr) => {
    return acc + BigInt(curr.inAmount);
  }, BigInt(0));

  const inAmountInDecimal = inSwapData.reduce((acc, curr) => {
    return acc.add(curr.inAmountInDecimal ?? 0);
  }, new Decimal(0));
  const inAmountInUSD = inSwapData.reduce((acc, curr) => {
    return acc.add(curr.inAmountInUSD ?? 0);
  }, new Decimal(0));

  const outSymbol = null; // We don't longer support this.
  const outMint = swapData[finalPositions[0]].outMint;
  const outSwapData = swapData.filter(
    (swap, index) => finalPositions.includes(index) && swap.outMint === outMint
  );
  const outAmount = outSwapData.reduce((acc, curr) => {
    return acc + BigInt(curr.outAmount);
  }, BigInt(0));
  const outAmountInDecimal = outSwapData.reduce((acc, curr) => {
    return acc.add(curr.outAmountInDecimal ?? 0);
  }, new Decimal(0));
  const outAmountInUSD = outSwapData.reduce((acc, curr) => {
    return acc.add(curr.outAmountInUSD ?? 0);
  }, new Decimal(0));

  const volumeInUSD =
    outAmountInUSD && inAmountInUSD
      ? Decimal.min(outAmountInUSD, inAmountInUSD)
      : outAmountInUSD ?? inAmountInUSD;

  const swap = {} as SwapAttributes;

  const [instructionName, transferAuthority, lastAccount] =
    parser.getInstructionNameAndTransferAuthorityAndLastAccount(instructions);

  swap.transferAuthority = transferAuthority;
  swap.lastAccount = lastAccount;
  swap.instruction = instructionName;
  swap.owner = tx.transaction.message.accountKeys[0].pubkey;
  swap.programId = programId.toBase58();
  swap.signature = signature;
  swap.timestamp = new Date(new Date((blockTime ?? 0) * 1000).toISOString());
  swap.legCount = swapEvents.length;
  swap.volumeInUSD = volumeInUSD.toNumber();

  swap.inSymbol = inSymbol;
  swap.inAmount = inAmount;
  swap.inAmountInDecimal = inAmountInDecimal.toNumber();
  swap.inAmountInUSD = inAmountInUSD.toNumber();
  swap.inMint = inMint;

  swap.outSymbol = outSymbol;
  swap.outAmount = outAmount;
  swap.outAmountInDecimal = outAmountInDecimal.toNumber();
  swap.outAmountInUSD = outAmountInUSD.toNumber();
  swap.outMint = outMint;

  const exactOutAmount = parser.getExactOutAmount(
    tx.transaction.message.instructions
  );
  if (exactOutAmount) {
    swap.exactOutAmount = BigInt(exactOutAmount);

    if (outAmountInUSD) {
      swap.exactOutAmountInUSD = new Decimal(exactOutAmount)
        .div(outAmount.toString())
        .mul(outAmountInUSD)
        .toNumber();
    }
  }

  const exactInAmount = parser.getExactInAmount(
    tx.transaction.message.instructions
  );
  if (exactInAmount) {
    swap.exactInAmount = BigInt(exactInAmount);

    if (inAmountInUSD) {
      swap.exactInAmountInUSD = new Decimal(exactInAmount)
        .div(inAmount.toString())
        .mul(inAmountInUSD)
        .toNumber();
    }
  }

  swap.swapData = JSON.parse(JSON.stringify(swapData));

  if (feeEvent) {
    const { mint, amount, amountInDecimal, amountInUSD } = await extractVolume(
      accountInfosMap,
      feeEvent.mint,
      feeEvent.amount
    );
    swap.feeTokenPubkey = feeEvent.account.toBase58();
    swap.feeOwner = extractTokenAccountOwner(
      accountInfosMap,
      feeEvent.account
    )?.toBase58();
    swap.feeAmount = BigInt(amount);
    swap.feeAmountInDecimal = amountInDecimal?.toNumber();
    swap.feeAmountInUSD = amountInUSD?.toNumber();
    swap.feeMint = mint;
  }

  // return swap;

  const { ca, signer } = getMintToken(tx);
  const swapInfo = await checkTraderBuyOrSell(tx, ca, signer);

  // const solTransfer = parser.parseTokenChange(tx, WSOL, signer);
  // const usdcTransfer = parser.parseTokenChange(tx, USDC, signer);
  // const usdtTransfer = parser.parseTokenChange(tx, USDT, signer);

  const tokenBalanceChanged = parser.parseTokenBalanceChanged(tx, signer);

  return {
    swapInfo,
    balanceInfo: tokenBalanceChanged,
  };
}

async function parseSwapEvents(
  accountInfosMap: AccountInfoMap,
  swapEvents: SwapEvent[]
) {
  const swapData = await Promise.all(
    swapEvents.map((swapEvent) => extractSwapData(accountInfosMap, swapEvent))
  );

  return swapData;
}

async function extractSwapData(
  accountInfosMap: AccountInfoMap,
  swapEvent: SwapEvent
) {
  const amm =
    AMM_TYPES[swapEvent.amm.toBase58()] ??
    `Unknown program ${swapEvent.amm.toBase58()}`;

  const {
    mint: inMint,
    amount: inAmount,
    amountInDecimal: inAmountInDecimal,
    amountInUSD: inAmountInUSD,
  } = await extractVolume(
    accountInfosMap,
    swapEvent.inputMint,
    swapEvent.inputAmount
  );
  const {
    mint: outMint,
    amount: outAmount,
    amountInDecimal: outAmountInDecimal,
    amountInUSD: outAmountInUSD,
  } = await extractVolume(
    accountInfosMap,
    swapEvent.outputMint,
    swapEvent.outputAmount
  );

  return {
    amm,
    inMint,
    inAmount,
    inAmountInDecimal,
    inAmountInUSD,
    outMint,
    outAmount,
    outAmountInDecimal,
    outAmountInUSD,
  };
}

async function extractVolume(
  accountInfosMap: AccountInfoMap,
  mint: PublicKey,
  amount: BN
) {
  const tokenPriceInUSD = await getPriceInUSDByMint(mint.toBase58());
  const tokenDecimals = extractMintDecimals(accountInfosMap, mint);
  const amountInDecimal = DecimalUtil.fromBN(amount, tokenDecimals);
  const amountInUSD = tokenPriceInUSD
    ? amountInDecimal.mul(tokenPriceInUSD)
    : undefined;

  return {
    mint: mint.toBase58(),
    amount: amount.toString(),
    amountInDecimal,
    amountInUSD,
  };
}

function extractTokenAccountOwner(
  accountInfosMap: AccountInfoMap,
  account: PublicKey
) {
  const accountData = accountInfosMap.get(account.toBase58());

  if (accountData) {
    const accountInfo = unpackAccount(account, accountData, accountData.owner);
    return accountInfo.owner;
  }

  return;
}

function extractMintDecimals(accountInfosMap: AccountInfoMap, mint: PublicKey) {
  const mintData = accountInfosMap.get(mint.toBase58());

  if (mintData) {
    const mintInfo = unpackMint(mint, mintData, mintData.owner);
    return mintInfo.decimals;
  }

  return;
}

async function checkTraderBuyOrSell(
  data: any,
  tokenAddress: string,
  traderAddress: string
) {
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

  return {
    AMM: "Jupiter",
    MINT: tokenAddress,
    TYPE: side.toUpperCase(),
    TOKEN: swappedTokenAmount,
    SOL: swappedSOLAmount,
    PRICE: postPoolSOL / postPoolToken,
    MAKER: traderAddress,
    DATE: date,
  };
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
