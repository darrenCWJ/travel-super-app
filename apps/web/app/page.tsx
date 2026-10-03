import { BeingRebuilt, REBUILDING_METADATA } from "@/components/BeingRebuilt";

/**
 * The home page while the app is rebuilt. The trips dashboard it used to show
 * needs sign-in and the retired store, so this links to the one part that
 * still works, the destination explorer on /plan. Production never renders
 * this: `proxy.ts` sends every path there to /rebuilding, which has no link.
 */
export const metadata = REBUILDING_METADATA;

export default function Home() {
  return <BeingRebuilt showExplorerLink />;
}
