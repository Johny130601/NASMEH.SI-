"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  saveBundleBannerAction, saveHeroAction, saveHomeSectionsAction, saveRoutineBannerAction, type CmsActionResult,
} from "@/app/admin/(shell)/vsebina/actions";
import { heroClaimLacksFootnote, isVideoPath, type BundleBannerInput, type HeroInput, type RoutineBannerInput } from "@/lib/admin/cms-schemas";
import type { HomeSectionSetting } from "@/lib/settings";
import type { UnavailableLink } from "@/lib/content-links";
import { admin as copy } from "@/lib/copy/admin";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiInput } from "@/components/storefront/ui/UiInput";
import { ContentLinkWarning, unavailableLinksText } from "./ContentLinkWarning";

const c = copy.content.home;
const textareaClass = "w-full resize-y rounded-input border border-light-1 bg-white p-4 text-base outline-none focus:border-brand";
const smallButton = "rounded-btn border border-light-1 px-3 py-1.5 text-xs disabled:opacity-40";

export interface MediaOption { url: string; alt: string }

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-light-2 bg-white p-5">
      <h2 className="text-base font-medium">{title}</h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * Save state of one block. `links`: the block's saved links that lead to a product page answering 404
 * (QA v-a) and the template that says what the storefront does instead; named on load and after a save.
 */
function useSave(links?: { template: string; initial: UnavailableLink[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [deadLinks, setDeadLinks] = useState(links?.initial ?? []);
  const run = (task: () => Promise<CmsActionResult>, okText: string) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await task();
        setMessage(result.ok ? { ok: true, text: okText } : { ok: false, text: result.error === "videoExternal" ? c.hero.videoExternal : c.invalid });
        if (result.ok) {
          setDeadLinks(result.unavailableLinks ?? []);
          router.refresh();
        }
      } catch {
        setMessage({ ok: false, text: copy.common.error });
      }
    });
  };
  const status = message ? <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-error"}`}>{message.text}</p> : null;
  const warning = <ContentLinkWarning text={links && deadLinks.length ? unavailableLinksText(links.template, deadLinks) : null} />;
  return { pending, run, status, warning };
}

export function SectionsEditor({ initial }: { initial: HomeSectionSetting[] }) {
  const [sections, setSections] = useState(initial);
  const { pending, run, status } = useSave();
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
  };
  return (
    <Section title={c.sections.title}>
      <p className="text-sm text-mid-1">{c.sections.hint}</p>
      <ol className="flex flex-col gap-2" data-home-sections>
        {sections.map((section, index) => (
          <li key={section.id} className="flex flex-wrap items-center gap-3 rounded-card border border-light-2 p-3" data-section-row={section.id}>
            <span className="w-6 text-sm text-mid-2">{index + 1}.</span>
            <span className="flex-1 text-sm">{c.sections.names[section.id]}</span>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={section.visible} onChange={(event) => setSections(sections.map((entry, position) => (position === index ? { ...entry, visible: event.target.checked } : entry)))} className="size-4 accent-brand" data-section-visible />
              {c.sections.visible}
            </label>
            <button type="button" className={smallButton} disabled={index === 0} onClick={() => move(index, -1)} data-section-up>{c.sections.up}</button>
            <button type="button" className={smallButton} disabled={index === sections.length - 1} onClick={() => move(index, 1)} data-section-down>{c.sections.down}</button>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3">
        <UiButton variant="primary" disabled={pending} onClick={() => run(() => saveHomeSectionsAction(sections), c.sections.saved)} data-sections-save>{c.sections.save}</UiButton>
        {status}
      </div>
    </Section>
  );
}

export function HeroEditor({ initial, media, unavailableLinks = [] }: { initial: HeroInput; media: MediaOption[]; unavailableLinks?: UnavailableLink[] }) {
  const [hero, setHero] = useState(initial);
  // Library images for the poster, library videos (MP4/WebM, same origin) for the two video fields.
  const images = media.filter((item) => !isVideoPath(item.url));
  const videos = media.filter((item) => isVideoPath(item.url));
  const { pending, run, status, warning } = useSave({ template: copy.content.links.hero, initial: unavailableLinks });
  const field = (key: keyof HeroInput) => ({ value: hero[key] ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement>) => setHero({ ...hero, [key]: event.target.value }) });
  return (
    <form onSubmit={(event) => { event.preventDefault(); run(() => saveHeroAction(hero), c.hero.saved); }} data-hero-form>
      <Section title={c.hero.title}>
        <datalist id="media-urls">{images.map((item) => <option key={item.url} value={item.url}>{item.alt || item.url}</option>)}</datalist>
        <datalist id="media-videos">{videos.map((item) => <option key={item.url} value={item.url}>{item.alt || item.url}</option>)}</datalist>
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.hero.fields.kicker} name="kicker" maxLength={40} {...field("kicker")} />
          <UiInput label={c.hero.fields.title} name="title" required maxLength={120} {...field("title")} />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.hero.fields.subtitle}
          <textarea value={hero.subtitle} rows={3} maxLength={400} onChange={(event) => setHero({ ...hero, subtitle: event.target.value })} className={textareaClass} />
        </label>
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {c.hero.fields.footnote}
            <textarea name="footnote" value={hero.footnote ?? ""} rows={2} maxLength={300} aria-describedby="hero-footnote-hint" onChange={(event) => setHero({ ...hero, footnote: event.target.value })} className={textareaClass} />
          </label>
          <p id="hero-footnote-hint" className="text-xs text-mid-2">{c.hero.footnoteHint}</p>
          {heroClaimLacksFootnote(hero) ?<p role="alert" className="text-xs text-error" data-hero-footnote-missing>{c.hero.footnoteMissing}</p> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.hero.fields.ctaLabel} name="ctaLabel" required maxLength={40} {...field("ctaLabel")} />
          <UiInput label={c.hero.fields.ctaHref} name="ctaHref" required maxLength={500} {...field("ctaHref")} />
          <UiInput label={c.hero.fields.poster} name="poster" list="media-urls" maxLength={500} hint={c.hero.mediaHint} {...field("poster")} />
          <UiInput label={c.hero.fields.imageAlt} name="imageAlt" maxLength={200} {...field("imageAlt")} />
          <UiInput label={c.hero.fields.videoDesktop} name="videoDesktop" list="media-videos" maxLength={500} hint={c.hero.videoHint} {...field("videoDesktop")} />
          <UiInput label={c.hero.fields.videoMobile} name="videoMobile" list="media-videos" maxLength={500} hint={c.hero.videoHint} {...field("videoMobile")} />
          <UiInput label={c.hero.fields.promoOverlayText} name="promoOverlayText" maxLength={120} {...field("promoOverlayText")} />
          <UiInput label={c.hero.fields.promoOverlayHref} name="promoOverlayHref" maxLength={500} {...field("promoOverlayHref")} />
        </div>
        <div className="flex items-center gap-3">
          <UiButton type="submit" variant="primary" disabled={pending} data-hero-save>{c.hero.save}</UiButton>
          {status}
        </div>
        {warning}
      </Section>
    </form>
  );
}

export function BundleBannerEditor({ initial, unavailableLinks = [] }: { initial: BundleBannerInput; unavailableLinks?: UnavailableLink[] }) {
  const [banner, setBanner] = useState(initial);
  const { pending, run, status, warning } = useSave({ template: copy.content.links.banner, initial: unavailableLinks });
  return (
    <form onSubmit={(event) => { event.preventDefault(); run(() => saveBundleBannerAction(banner), c.bundleBanner.saved); }} data-bundle-banner-form>
      <Section title={c.bundleBanner.title}>
        <div className="grid gap-4 md:grid-cols-3">
          <UiInput label={c.bundleBanner.fields.title} name="bundleTitle" required maxLength={120} value={banner.title} onChange={(event) => setBanner({ ...banner, title: event.target.value })} />
          <UiInput label={c.bundleBanner.fields.cta} name="bundleCta" required maxLength={40} value={banner.cta} onChange={(event) => setBanner({ ...banner, cta: event.target.value })} />
          <UiInput label={c.bundleBanner.fields.href} name="bundleHref" required maxLength={500} value={banner.href} onChange={(event) => setBanner({ ...banner, href: event.target.value })} />
        </div>
        <div className="flex items-center gap-3">
          <UiButton type="submit" variant="primary" disabled={pending} data-bundle-banner-save>{c.bundleBanner.save}</UiButton>
          {status}
        </div>
        {warning}
      </Section>
    </form>
  );
}

export function RoutineBannerEditor({ initial, media, unavailableLinks = [] }: { initial: RoutineBannerInput; media: MediaOption[]; unavailableLinks?: UnavailableLink[] }) {
  const [banner, setBanner] = useState(initial);
  const images = media.filter((item) => !isVideoPath(item.url));
  const { pending, run, status, warning } = useSave({ template: copy.content.links.banner, initial: unavailableLinks });
  return (
    <form onSubmit={(event) => { event.preventDefault(); run(() => saveRoutineBannerAction(banner), c.routineBanner.saved); }} data-routine-banner-form>
      <Section title={c.routineBanner.title}>
        <datalist id="media-urls-routine">{images.map((item) => <option key={item.url} value={item.url}>{item.alt || item.url}</option>)}</datalist>
        <div className="grid gap-4 md:grid-cols-2">
          <UiInput label={c.routineBanner.fields.title} name="routineTitle" required maxLength={160} value={banner.title} onChange={(event) => setBanner({ ...banner, title: event.target.value })} />
          <UiInput label={c.routineBanner.fields.href} name="routineHref" required maxLength={500} value={banner.href} onChange={(event) => setBanner({ ...banner, href: event.target.value })} />
          <UiInput label={c.routineBanner.fields.image} name="routineImage" list="media-urls-routine" required maxLength={500} value={banner.image} onChange={(event) => setBanner({ ...banner, image: event.target.value })} />
          <UiInput label={c.routineBanner.fields.imageAlt} name="routineImageAlt" required maxLength={200} value={banner.imageAlt} onChange={(event) => setBanner({ ...banner, imageAlt: event.target.value })} />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.routineBanner.fields.footnote}
          <textarea value={banner.footnote} rows={2} maxLength={600} onChange={(event) => setBanner({ ...banner, footnote: event.target.value })} className={textareaClass} />
        </label>
        <div className="flex items-center gap-3">
          <UiButton type="submit" variant="primary" disabled={pending} data-routine-banner-save>{c.routineBanner.save}</UiButton>
          {status}
        </div>
        {warning}
      </Section>
    </form>
  );
}
