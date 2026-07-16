import { redirect } from "next/navigation";

// Hidden: the terminal was a hardcoded demo with canned command output.
// Restore from git history if a real CLI-over-API is ever built.
export default function TerminalPage() {
  redirect("/");
}
