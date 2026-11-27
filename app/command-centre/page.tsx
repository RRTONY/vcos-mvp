import { redirect } from "next/navigation";
import { WORKSPACE_HOME } from "@/lib/workspace";

export default function CommandCentreIndex() {
  redirect(WORKSPACE_HOME.cc);
}
