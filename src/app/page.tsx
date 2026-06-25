import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();
  if (session.userId) {
    redirect("/projects");
  } else {
    redirect("/login");
  }
}
