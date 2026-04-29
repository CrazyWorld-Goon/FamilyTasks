import type { PaymentProposal } from "./types";

/** Dev/household trace: real P2P send can be wired here later. */
export function logFabricPaymentProposal(proposal: PaymentProposal): void {
  try {
    // eslint-disable-next-line no-console
    console.debug("[family-tasks] Fabric PaymentProposal (household message)", proposal);
  } catch {
    // ignore
  }
}
