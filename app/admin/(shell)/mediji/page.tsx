import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/admin/access";
import { listMediaAssets } from "@/lib/admin/cms";
import { admin as copy } from "@/lib/copy";
import { MediaLibrary } from "@/components/admin/MediaLibrary";

export const metadata: Metadata = { title: copy.content.media.title, robots: { index: false, follow: false } };

/** /admin/mediji — the global media library (§14.10). */
export default async function AdminMediaPage() {
  await requirePagePermission("content:manage");
  const assets = await listMediaAssets();
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-media>
      <h1 className="text-[2rem]">{copy.content.media.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-mid-1">{copy.content.media.intro}</p>
      <div className="mt-4">
        <MediaLibrary assets={assets.map((asset) => ({ id: asset.id, url: asset.url, alt: asset.alt, width: asset.width, height: asset.height, bytes: asset.bytes, references: asset.references }))} />
      </div>
    </section>
  );
}
