import { notFound } from "next/navigation";
import { CC_TABS } from "@/lib/workspace";

export function generateStaticParams() {
  return CC_TABS.map((t) => ({ tab: t.slug }));
}
export const dynamicParams = false;

// The Command Centre itself renders in ../layout.tsx; this page only makes
// sure the tab in the URL exists.
export default function CommandCentreTab({ params }: { params: { tab: string } }) {
  if (!CC_TABS.some((t) => t.slug === params.tab)) notFound();
  return null;
}
