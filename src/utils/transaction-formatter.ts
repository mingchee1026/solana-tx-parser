import * as base58 from "bs58";
import {
  AccountMeta,
  CompiledInstruction,
  ConfirmedTransactionMeta,
  LoadedAddresses,
  Message,
  MessageCompiledInstruction,
  MessageV0,
  PublicKey,
  TransactionInstruction,
  VersionedMessage,
  VersionedTransactionResponse,
} from "@solana/web3.js";

export class TransactionFormatter {
  public formTransactionFromJson(data: any, time: number) {
    //: VersionedTransactionResponse {
    const rawTx = data["transaction"];

    const slot = data.slot;
    const version = rawTx.transaction.version ? 0 : "legacy";

    const meta = this.formMeta(rawTx.meta);
    const signatures = rawTx.transaction.signatures.map((s: string) => s);

    const message = this.formTxnMessage(rawTx.transaction.message);

    return {
      slot,
      version,
      blockTime: time,
      meta,
      transaction: {
        signatures,
        message,
      },
    };
  }

  private formMeta(meta: any): ConfirmedTransactionMeta {
    return {
      err: meta.error ? { err: meta.error } : null,
      fee: meta.fee,
      preBalances: meta.preBalances,
      postBalances: meta.postBalances,
      preTokenBalances: meta.preTokenBalances || [],
      postTokenBalances: meta.postTokenBalances || [],
      logMessages: meta.logMessages || [],
      loadedAddresses:
        meta.loadedWritableAddresses || meta.loadedReadonlyAddresses
          ? {
              writable:
                meta.loadedWritableAddresses?.map(
                  (address: string) => address //new PublicKey(Buffer.from(address, "base64"))
                ) || [],
              readonly:
                meta.loadedReadonlyAddresses?.map(
                  (address: string) => address //new PublicKey(Buffer.from(address, "base64"))
                ) || [],
            }
          : undefined,
      innerInstructions:
        meta.innerInstructions?.map(
          (i: { index: number; instructions: any }) => ({
            index: i.index || 0,
            instructions: i.instructions.map((instruction: any) => ({
              programIdIndex: instruction.programIdIndex,
              accounts: instruction.accounts || [],
              data: base58.default.encode(
                Buffer.from(instruction.data || "", "base64")
              ),
            })),
          })
        ) || [],
    };
  }

  private formTxnMessage(message: any) {
    //: VersionedMessage {
    return {
      recentBlockhash: message.recentBlockhash,
      accountKeys: message.accountKeys?.map(
        (d: any) => {
          console.log(d);
          return d;
        } //Buffer.from(d, "base64")
      ),
      instructions: message.instructions.map(
        ({
          data,
          programIdIndex,
          accounts,
        }: {
          data: any;
          programIdIndex: any;
          accounts: any;
        }) => ({
          programIdIndex: programIdIndex,
          accounts: Array.isArray(accounts) ? [...accounts] : [],
          data: base58.default.encode(Buffer.from(data || "", "base64")),
        })
      ),
      addressTableLookups:
        message.addressTableLookups?.map(
          ({
            accountKey,
            writableIndexes,
            readonlyIndexes,
          }: {
            accountKey: any;
            writableIndexes: any;
            readonlyIndexes: any;
          }) => ({
            writableIndexes: writableIndexes || [],
            readonlyIndexes: readonlyIndexes || [],
            accountKey: new PublicKey(accountKey), //Buffer.from(accountKey, "base64")),
          })
        ) || [],
    };
  }
}
