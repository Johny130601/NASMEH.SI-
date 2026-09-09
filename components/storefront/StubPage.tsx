import { legal } from "@/lib/copy";
import { UiButton } from "./ui/UiButton";

/** Shared placeholder for routes landing in later phases. */
export function StubPage({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto max-w-md px-(--padding) py-24 text-center">
      <h1 className="text-[2rem]">{title}</h1>
      <p className="mt-4 text-sm text-mid-1">{body}</p>
      <div className="mt-8 flex justify-center">
        <UiButton href="/" variant="outline">
          {legal.backHome}
        </UiButton>
      </div>
    </section>
  );
}
