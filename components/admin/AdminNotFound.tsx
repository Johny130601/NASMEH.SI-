import Link from "next/link";
import { admin as copy } from "@/lib/copy/admin";

/**
 * The admin's own 404 body (QA 2026-10-03 T4-09). The not-found files under
 * app/admin/(shell) render it inside the admin shell, so staff keep the
 * sidebar and stay in /admin — the storefront 404 sent them to the shop home
 * after a ten-second countdown. No countdown here: the operator reads why and
 * picks the way back (the section's list when there is one, the dashboard).
 */
export function AdminNotFound({ body, back }: { body: string; back?: { href: string; label: string } }) {
  return (
    <section className="mx-auto max-w-(--container-wide)" data-admin-not-found>
      <p className="text-sm text-mid-2" aria-hidden="true">404</p>
      <h1 className="mt-1 text-[2rem]">{copy.notFound.title}</h1>
      <p className="mt-3 max-w-2xl text-sm text-mid-1">{body}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {back ? (
          <Link href={back.href} className="rounded-btn bg-dark-1 px-4 py-2 text-sm text-white" data-admin-not-found-back>{back.label}</Link>
        ) : null}
        <Link href="/admin" className="rounded-btn border border-light-1 bg-white px-4 py-2 text-sm text-dark-1" data-admin-not-found-dashboard>
          {copy.notFound.dashboard}
        </Link>
      </div>
    </section>
  );
}
