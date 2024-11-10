import { ParsedInstruction, PublicKey } from "@solana/web3.js";

export interface TransactionWithMeta {
  // meta: {
  //   logMessages?: string[] | null;
  //   innerInstructions?:
  //     | {
  //         index: number;
  //         instructions: (ParsedInstruction | PartialInstruction)[];
  //       }[]
  //     | null;
  // } | null;
  // transaction: {
  //   signatures: string[];
  //   message: {
  //     accountKeys: { pubkey: PublicKey }[];
  //     instructions: (ParsedInstruction | PartialInstruction)[];
  //   };
  // };
}
