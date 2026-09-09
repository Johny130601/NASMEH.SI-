import { permanentRedirect } from "next/navigation";

export default function BundlesPage() {
  permanentRedirect("/trgovina?kolekcija=paketi");
}
