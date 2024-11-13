import { PublicKey } from "@solana/web3.js";
import { BorshCoder, Program } from "@coral-xyz/anchor";
import * as base58 from "bs58";
import { IDL } from "../idl/jupiter";
import {
  ParsedInstruction,
  PartialInstruction,
  RoutePlan,
  TransactionWithMeta,
} from "../types";

export class InstructionParser {
  private coder: BorshCoder;
  private programId: PublicKey;

  constructor(programId: PublicKey) {
    this.programId = programId;
    this.coder = new BorshCoder(IDL);
  }

  getInstructionNameAndTransferAuthorityAndLastAccount(
    instructions: PartialInstruction[]
  ) {
    for (const instruction of instructions) {
      if (instruction.programId !== this.programId.toBase58()) {
        continue;
      }

      const ix = this.coder.instruction.decode(instruction.data, "base58");

      if (this.isRouting(ix.name)) {
        const instructionName = ix.name;
        const transferAuthority =
          instruction.accounts[
            this.getTransferAuthorityIndex(instructionName)
          ].toString();
        const lastAccount =
          instruction.accounts[instruction.accounts.length - 1].toString();

        return [ix.name, transferAuthority, lastAccount];
      }
    }

    return [];
  }

  getTransferAuthorityIndex(instructionName: string) {
    switch (instructionName) {
      case "route":
      case "exactOutRoute":
      case "routeWithTokenLedger":
        return 1;
      case "sharedAccountsRoute":
      case "sharedAccountsRouteWithTokenLedger":
      case "sharedAccountsExactOutRoute":
        return 2;
    }
  }

  // For CPI, we have to also check for innerInstructions.
  getInstructions(tx: any): PartialInstruction[] {
    const parsedInstructions: PartialInstruction[] = [];
    for (const instruction of tx.transaction.message.instructions) {
      if (instruction.programId === this.programId.toBase58()) {
        parsedInstructions.push(instruction as any);
      }
    }

    for (const instructions of tx.meta.innerInstructions) {
      for (const instruction of instructions.instructions) {
        if (instruction.programId === this.programId.toBase58()) {
          parsedInstructions.push(instruction as any);
        }
      }
    }

    return parsedInstructions;
  }

  // Extract the position of the initial and final swap from the swap array.
  getInitialAndFinalSwapPositions(instructions: PartialInstruction[]) {
    for (const instruction of instructions) {
      if (instruction.programId !== this.programId.toBase58()) {
        continue;
      }

      let ix = null;
      try {
        ix = this.coder.instruction.decode(instruction.data, "base58");
      } catch (error) {
        // console.log(
        //   "ERROR: getInitialAndFinalSwapPositions => ",
        //   error.message
        // );
      }

      // This will happen because now event is also an CPI instruction.
      if (!ix) {
        continue;
      }

      if (this.isRouting(ix.name)) {
        const routePlan = (ix.data as any).routePlan as RoutePlan;
        const inputIndex = 0;
        const outputIndex = routePlan.length;

        const initialPositions: number[] = [];
        for (let j = 0; j < routePlan.length; j++) {
          if (routePlan[j].inputIndex === inputIndex) {
            initialPositions.push(j);
          }
        }

        const finalPositions: number[] = [];
        for (let j = 0; j < routePlan.length; j++) {
          if (routePlan[j].outputIndex === outputIndex) {
            finalPositions.push(j);
          }
        }

        if (
          finalPositions.length === 0 &&
          this.isCircular((ix.data as any).routePlan)
        ) {
          for (let j = 0; j < (ix.data as any).routePlan.length; j++) {
            if ((ix.data as any).routePlan[j].outputIndex === 0) {
              finalPositions.push(j);
            }
          }
        }

        return [initialPositions, finalPositions];
      }
    }
  }

  getExactOutAmount(instructions: (ParsedInstruction | PartialInstruction)[]) {
    for (const instruction of instructions) {
      if (instruction.programId !== this.programId.toBase58()) {
        continue;
      }
      if (!("data" in instruction)) continue; // Guard in case it is a parsed decoded instruction, should be impossible

      const ix = this.coder.instruction.decode(instruction.data, "base58");

      if (this.isExactIn(ix.name)) {
        return (ix.data as any).quotedOutAmount.toString();
      }
    }

    return;
  }

  getExactInAmount(instructions: (ParsedInstruction | PartialInstruction)[]) {
    for (const instruction of instructions) {
      if (instruction.programId !== this.programId.toBase58()) {
        continue;
      }
      if (!("data" in instruction)) continue; // Guard in case it is a parsed decoded instruction, should be impossible

      const ix = this.coder.instruction.decode(instruction.data, "base58");

      if (this.isExactOut(ix.name)) {
        return (ix.data as any).quotedInAmount.toString();
      }
    }

    return;
  }

  isExactIn(name: string) {
    return (
      name === "route" ||
      name === "routeWithTokenLedger" ||
      name === "sharedAccountsRoute" ||
      name === "sharedAccountsRouteWithTokenLedger"
    );
  }

  isExactOut(name: string) {
    return name === "sharedAccountsExactOutRoute" || name === "exactOutRoute";
  }

  isRouting(name: string) {
    return (
      name === "route" ||
      name === "routeWithTokenLedger" ||
      name === "sharedAccountsRoute" ||
      name === "sharedAccountsRouteWithTokenLedger" ||
      name === "sharedAccountsExactOutRoute" ||
      name === "exactOutRoute"
    );
  }

  isCircular(routePlan: RoutePlan) {
    if (!routePlan || routePlan.length === 0) {
      return false; // Empty or null array is not circular
    }

    const indexMap = new Map(
      routePlan.map((obj) => [obj.inputIndex, obj.outputIndex])
    );
    let visited = new Set();
    let currentIndex = routePlan[0].inputIndex; // Start from the first object's inputIndex

    while (true) {
      if (visited.has(currentIndex)) {
        return currentIndex === routePlan[0].inputIndex;
      }

      visited.add(currentIndex);

      if (!indexMap.has(currentIndex)) {
        return false; // No further mapping, not circular
      }

      currentIndex = indexMap.get(currentIndex);
    }
  }

  parseSolChange(transactionResponse: any) {
    const preSolBalance = transactionResponse.meta?.preBalances?.[0];
    const postSolBalance = transactionResponse.meta?.postBalances?.[0];

    if (preSolBalance !== undefined && postSolBalance !== undefined) {
      const solBalanceChange = postSolBalance - preSolBalance;
      console.log(`Sol change: ${solBalanceChange}`);
      return { postSolBalance, solBalanceChange };
    }

    console.error(
      "Failed to get sol balance change for transaction id: ",
      transactionResponse.transaction.signatures[0]
    );
    return undefined;
  }

  parseTokenChange(transactionResponse: any, tokenMint: string, owner: string) {
    const preTokenBalancesArray = transactionResponse.meta?.preTokenBalances;
    const postTokenBalancesArray = transactionResponse.meta?.postTokenBalances;
    const tokenBalancesArray = [];
    if (
      postTokenBalancesArray !== null &&
      postTokenBalancesArray !== undefined
    ) {
      let index = 0;
      for (const postTokenBalance of postTokenBalancesArray) {
        const preTokenBalance = preTokenBalancesArray[index];
        if (postTokenBalance.mint === tokenMint) {
          // && tokenBalance.owner === owner) {
          const changedTokenAmount =
            postTokenBalance.uiTokenAmount.uiAmount -
            preTokenBalance.uiTokenAmount.uiAmount;
          if (changedTokenAmount !== 0)
            tokenBalancesArray.push({
              owner: postTokenBalance.owner,
              balance: changedTokenAmount,
              decimals: postTokenBalance.decimals,
            });
        }
        index++;
      }
    }
    return tokenBalancesArray;
  }

  parseTokenBalanceChanged(transactionResponse: any, owner: string) {
    const accountKeys = transactionResponse.transaction.message.accountKeys;
    const preTokenBalancesArray = transactionResponse.meta?.preTokenBalances;
    const postTokenBalancesArray = transactionResponse.meta?.postTokenBalances;
    const tokenBalancesArray = [];
    if (
      postTokenBalancesArray !== null &&
      postTokenBalancesArray !== undefined
    ) {
      let index = 0;
      for (const postTokenBalance of postTokenBalancesArray) {
        const accountIndex = postTokenBalance.accountIndex;
        const preTokenBalance = preTokenBalancesArray[index];
        if (!preTokenBalance) {
          continue;
        }
        // if (postTokenBalance.mint === tokenMint) {
        // && tokenBalance.owner === owner) {
        const changedTokenAmount =
          postTokenBalance.uiTokenAmount.uiAmount -
          preTokenBalance.uiTokenAmount.uiAmount;
        if (changedTokenAmount !== 0)
          tokenBalancesArray.push({
            address: accountKeys[accountIndex - 1].pubkey,
            owner: postTokenBalance.owner,
            balanceBefore: preTokenBalance.uiTokenAmount.uiAmount,
            balanceAfter: postTokenBalance.uiTokenAmount.uiAmount,
            change: changedTokenAmount,
            token: postTokenBalance.mint,
          });
        // }
        index++;
      }
    }
    return tokenBalancesArray;
  }
}
