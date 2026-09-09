"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { orders } from "@/lib/copy";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";

/** Email + order-number lookup form (GET → SSR result). */
export function LookupForm({
  defaultEmail,
  defaultNumber,
}: {
  defaultEmail: string;
  defaultNumber: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [number, setNumber] = useState(defaultNumber);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    router.push(
      `/sledi?email=${encodeURIComponent(email)}&narocilo=${encodeURIComponent(number)}`,
    );
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" data-lookup-form>
      <UiInput
        label={orders.lookup.emailLabel}
        name="email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <UiInput
        label={orders.lookup.numberLabel}
        name="narocilo"
        type="text"
        required
        value={number}
        onChange={(event) => setNumber(event.target.value)}
      />
      <UiButton type="submit" variant="primary" fullWidth>
        {orders.lookup.submit}
      </UiButton>
    </form>
  );
}
