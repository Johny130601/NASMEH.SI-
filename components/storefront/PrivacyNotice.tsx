import Link from "next/link";

/**
 * Short information notice at the point of collection (GDPR Art. 13, layered):
 * "<lead> <privacy policy link>." The href comes from the `legal.links`
 * Setting (getLegalLinks) through the server parent.
 */
export function PrivacyNotice({
  lead,
  link,
  href,
  className = "text-xs text-mid-2",
}: {
  lead: string;
  link: string;
  href: string;
  className?: string;
}) {
  return (
    <p className={className} data-privacy-notice>
      {lead}{" "}
      <Link href={href} className="underline underline-offset-2 transition-colors hover:text-dark-1">
        {link}
      </Link>
      .
    </p>
  );
}
