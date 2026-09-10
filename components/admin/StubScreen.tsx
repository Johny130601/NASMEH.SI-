import { admin as copy } from "@/lib/copy";

/** Placeholder for screens of later Phase 7 steps; the route is permission-gated already. */
export function StubScreen({ title, step }: { title: string; step: number }) {
  return (
    <section className="mx-auto max-w-2xl" data-admin-stub={step}>
      <h1 className="text-[2rem]">{title}</h1>
      <p className="mt-3 rounded-card border border-light-2 bg-white p-5 text-sm text-mid-1">
        <strong className="text-dark-1">{copy.stub.title}.</strong> {copy.stub.body.replace("{step}", String(step))}
      </p>
    </section>
  );
}
