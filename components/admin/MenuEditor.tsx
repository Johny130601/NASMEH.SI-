"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveMenuAction } from "@/app/admin/(shell)/navigacija/actions";
import { MENU_COLORS, type MenuItemInput } from "@/lib/admin/cms-schemas";
import { admin as copy } from "@/lib/copy";
import { UiButton } from "@/components/storefront/ui/UiButton";

const c = copy.content.menus.editor;
const inputClass = "min-h-[2.75rem] w-full rounded-input border border-light-1 bg-white px-3 text-sm outline-none focus:border-brand";
const smallButton = "rounded-btn border border-light-1 px-3 py-1.5 text-xs disabled:opacity-40";

interface LeafState { label: string; href: string; color: string }
interface ItemState extends LeafState { children: LeafState[]; featured: string }

export function toItemState(items: unknown[]): ItemState[] {
  return items.map((raw) => {
    const item = (raw ?? {}) as { label?: unknown; href?: unknown; color?: unknown; children?: unknown; featured?: unknown };
    const leaf = (entry: unknown): LeafState => {
      const child = (entry ?? {}) as { label?: unknown; href?: unknown; color?: unknown };
      return { label: typeof child.label === "string" ? child.label : "", href: typeof child.href === "string" ? child.href : "", color: typeof child.color === "string" ? child.color : "" };
    };
    return {
      ...leaf(item),
      children: Array.isArray(item.children) ? item.children.map(leaf) : [],
      featured: Array.isArray(item.featured) ? item.featured.filter((entry): entry is string => typeof entry === "string").join(", ") : "",
    };
  });
}

function toInput(items: ItemState[]): MenuItemInput[] {
  return items.map((item) => ({
    label: item.label, href: item.href, color: (item.color || undefined) as MenuItemInput["color"],
    children: item.children.map((child) => ({ label: child.label, href: child.href, color: (child.color || undefined) as MenuItemInput["color"] })),
    featured: item.featured.split(/[\s,]+/).map((slug) => slug.trim()).filter(Boolean),
  }));
}

function ColorSelect({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
      {MENU_COLORS.map((color) => <option key={color} value={color}>{c.colors[color]}</option>)}
    </select>
  );
}

export function MenuEditor({ handle, title: initialTitle, items: initialItems, withFeatured }: { handle: string; title: string; items: unknown[]; withFeatured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [items, setItems] = useState<ItemState[]>(() => toItemState(initialItems));
  const update = (index: number, patch: Partial<ItemState>) => setItems(items.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  };

  return (
    <form
      className="flex flex-col gap-4"
      data-menu-editor={handle}
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          try {
            const result = await saveMenuAction({ handle, title, items: toInput(items) });
            setMessage(result.ok ? { ok: true, text: c.saved } : { ok: false, text: c.invalid });
            if (result.ok) router.refresh();
          } catch {
            setMessage({ ok: false, text: copy.common.error });
          }
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {c.menuTitle}
        <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} className={inputClass} />
      </label>
      <ol className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={index} className="rounded-card border border-light-2 bg-white p-4" data-menu-item={index}>
            <div className="grid gap-2 md:grid-cols-[auto_2fr_3fr_1fr]">
              <span className="self-center text-sm text-mid-2">{c.item} {index + 1}</span>
              <input aria-label={`${c.label} ${index + 1}`} value={item.label} maxLength={60} required onChange={(event) => update(index, { label: event.target.value })} className={inputClass} />
              <input aria-label={`${c.href} ${index + 1}`} value={item.href} maxLength={500} required onChange={(event) => update(index, { href: event.target.value })} className={inputClass} />
              <ColorSelect label={`${c.color} ${index + 1}`} value={item.color} onChange={(color) => update(index, { color })} />
            </div>
            {withFeatured ? (
              <label className="mt-2 flex flex-col gap-1 text-xs text-mid-1">
                {c.featured}
                <input value={item.featured} maxLength={200} onChange={(event) => update(index, { featured: event.target.value })} className={inputClass} data-menu-featured={index} />
                <span className="text-xs text-mid-2">{c.featuredHint}</span>
              </label>
            ) : null}
            <fieldset className="mt-3 flex flex-col gap-2">
              <legend className="text-xs font-medium text-mid-1">{c.children}</legend>
              {item.children.map((child, childIndex) => (
                <div key={childIndex} className="grid gap-2 md:grid-cols-[2fr_3fr_1fr_auto]" data-menu-child={`${index}-${childIndex}`}>
                  <input aria-label={`${c.label} ${index + 1}.${childIndex + 1}`} value={child.label} maxLength={60} required onChange={(event) => update(index, { children: item.children.map((entry, position) => (position === childIndex ? { ...entry, label: event.target.value } : entry)) })} className={inputClass} />
                  <input aria-label={`${c.href} ${index + 1}.${childIndex + 1}`} value={child.href} maxLength={500} required onChange={(event) => update(index, { children: item.children.map((entry, position) => (position === childIndex ? { ...entry, href: event.target.value } : entry)) })} className={inputClass} />
                  <ColorSelect label={`${c.color} ${index + 1}.${childIndex + 1}`} value={child.color} onChange={(color) => update(index, { children: item.children.map((entry, position) => (position === childIndex ? { ...entry, color } : entry)) })} />
                  <button type="button" className={smallButton} onClick={() => update(index, { children: item.children.filter((_, position) => position !== childIndex) })}>{c.remove}</button>
                </div>
              ))}
              {item.children.length < 12 ? <button type="button" className={`${smallButton} self-start`} onClick={() => update(index, { children: [...item.children, { label: "", href: "", color: "" }] })}>{c.addChild}</button> : null}
            </fieldset>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={smallButton} disabled={index === 0} onClick={() => move(index, -1)}>{c.up}</button>
              <button type="button" className={smallButton} disabled={index === items.length - 1} onClick={() => move(index, 1)}>{c.down}</button>
              <button type="button" className="rounded-btn border border-error px-3 py-1.5 text-xs text-error" onClick={() => setItems(items.filter((_, position) => position !== index))}>{c.remove}</button>
            </div>
          </li>
        ))}
      </ol>
      {items.length < 20 ? <button type="button" className={`${smallButton} self-start`} onClick={() => setItems([...items, { label: "", href: "", color: "", children: [], featured: "" }])} data-menu-add>{c.addItem}</button> : null}
      <div className="flex items-center gap-3">
        <UiButton type="submit" variant="primary" disabled={pending} data-menu-save>{c.save}</UiButton>
        {message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`} data-menu-message>{message.text}</p> : null}
      </div>
    </form>
  );
}
