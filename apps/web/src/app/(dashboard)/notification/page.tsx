import { redirect } from "next/navigation";

// Hidden: the notifications feature is not built yet (the old page showed
// hardcoded mock data). Restore from git history when a real inbox exists.
export default function NotificationPage() {
  redirect("/");
}
