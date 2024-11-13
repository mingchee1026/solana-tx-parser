import { Event, Program, utils } from "@coral-xyz/anchor";
import { JUPITER_V6_PROGRAM_ID } from "../constants";
import { TransactionWithMeta } from "../types";

export function getEvents(
  program: Program,
  transactionResponse: any //TransactionWithMeta
) {
  let events: Event[] = [];

  if (transactionResponse && transactionResponse.meta) {
    let { meta } = transactionResponse;

    meta.innerInstructions?.map(async (ix) => {
      ix.instructions.map(async (iix) => {
        // console.log(iix.programId, JUPITER_V6_PROGRAM_ID.toBase58());
        if (iix.programId !== JUPITER_V6_PROGRAM_ID.toBase58()) return;
        if (!("data" in iix)) return; // Guard in case it is a parsed decoded instruction

        const ixData = utils.bytes.bs58.decode(iix.data);
        const eventData = utils.bytes.base64.encode(ixData.subarray(8));
        const event = program.coder.events.decode(eventData);

        if (!event) return;

        events.push(event);
      });
    });
  }

  return events;
}
