import { BeingRebuilt, REBUILDING_METADATA } from "@/components/BeingRebuilt";

/**
 * Retired with the old store and sign-in (phase 1, slice A); answers with the
 * "being rebuilt" page until its replacement lands.
 */
export const metadata = REBUILDING_METADATA;

export default function Page() {
  return <BeingRebuilt />;
}
