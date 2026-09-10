import { requirePagePermission } from "@/lib/admin/access";
import { admin as copy } from "@/lib/copy";
import { StubScreen } from "@/components/admin/StubScreen";

export default async function Page() {
  await requirePagePermission("tickets:view");
  return <StubScreen title={copy.shell.nav.tickets} step={2} />;
}
