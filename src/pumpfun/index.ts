import {
    Connection,
    PublicKey,
    ParsedTransactionWithMeta,
    VersionedTransactionResponse,
    ParsedInstruction,
    PartiallyDecodedInstruction,
    TransactionInstruction,
  } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { BONDING_CURVE, PUMF_FUN_MINT_AUTHORITY, PUMF_FUN_PROGRAM_ID } from "../utils/constants";
import { TokenHolderResult, ApiResponse } from "./utils/types";
import { web3 } from "@coral-xyz/anchor";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const TOTAL_SUPPLY = 1000_000_000 * (10 ** 6);
export async function extractPumpFunTransaction(
    signature: string,
    connection: Connection,
    tx: any,
    blockTime?: number
  ) {
    if(isTokenLaunch(tx)) {
        const {signer, token} = getMintToken(tx);
        // console.log({signer, token});
        const holders = await findHolders(token);
        // console.log({ holders });
        const result = await pumpInfo(connection, signer, holders, token);
      return result;
    }  
  }

function isTokenLaunch(tx: any): boolean {
    const hasMintAuthority = tx.transaction.message.instructions.some(instruction =>
        instruction.accounts && instruction.accounts.includes(PUMF_FUN_MINT_AUTHORITY)
    )
    return hasMintAuthority;
}

function getMintToken(tx) {
    const data = tx.transaction.message.instructions.find(instruction =>
        instruction.program === "spl-associated-token-account" );
    
    const signer = data?.parsed?.info?.source;
    const token = data?.parsed?.info.mint;
    // console.log(data?.parsed?.info);
    return {
      signer,
      token,
    };
  }

const findHolders = async (tokenAddress: string) => {
  // Pagination logic
  let page = 1;
 	// allOwners will store all the addresses that hold the token
  const allOwners: TokenHolderResult[] = [];

  await sleep(1000);
  while (true) {
    const response = await fetch(process.env.RPC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getTokenAccounts",
        id: "helius-test",
        params: {
          page: page,
          limit: 1000,
          displayOptions: {},
					//mint address for the token we are interested in
          mint: tokenAddress,
        },
      }),
    });
    const data = await response.json() as ApiResponse;
  	// Pagination logic. 
    if (!data.result || data.result.token_accounts.length === 0) {
      // console.log(`No more results. Total pages: ${page - 1}`);
      break;
    }
    // console.log(`Processing results from page ${page}`);
 		// Adding unique owners to a list of token owners. 
    data.result.token_accounts.forEach((account) => {
      // console.log({account});
      const info: TokenHolderResult = {
        owner: account.owner,
        amount: account.amount,
      };
      allOwners.push(info);
    });
    page++;
  }
  // console.log(allOwners);
  return allOwners;
  
};

const pumpInfo = async(connection: Connection, creator: string, allOwners: TokenHolderResult[], token: string) => {
  let firstBuying = 0;
  let devBuying = 0;
  let creatorSolBalance = 0;

	const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new PublicKey(token).toBytes()], new PublicKey(PUMF_FUN_PROGRAM_ID));
	
  creatorSolBalance = await connection.getBalance(new PublicKey(creator));
  creatorSolBalance /= web3.LAMPORTS_PER_SOL;

  allOwners.forEach(async (owner) => {
    if (owner.owner !== bondingCurve.toBase58()){
      firstBuying += owner.amount/TOTAL_SUPPLY * 100;
    }
    if (owner.owner === creator) {
      devBuying = owner.amount/TOTAL_SUPPLY * 100;
    }
  });
  const transactionNumbers = (await connection.getSignaturesForAddress(new PublicKey(creator))).length;
  const FirstBuy = firstBuying.toFixed(2).toString() + ' %';
  const DevFirstBuy = devBuying.toFixed(2).toString() + ' %';
  const DevSolBalance = creatorSolBalance.toFixed(2).toString() + ' SOL';
  return { token, creator, FirstBuy, DevFirstBuy, DevSolBalance, transactionNumbers };
}