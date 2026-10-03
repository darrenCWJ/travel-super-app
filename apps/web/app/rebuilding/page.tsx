import { BeingRebuilt, REBUILDING_METADATA } from "@/components/BeingRebuilt";

/**
 * Where production sends every path while the app is rebuilt: `proxy.ts`
 * rewrites to here when VERCEL_ENV is "production". Reachable by name
 * everywhere else, which is what lets the page itself be tested.
 */
export const metadata = REBUILDING_METADATA;

export default function RebuildingPage() {
  return <BeingRebuilt />;
}
