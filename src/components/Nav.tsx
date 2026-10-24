"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// What Raghav uses every week sits in the tab row. Set-up and reference pages live under "More".
const TABS = [
  ["/", "Home"],
  ["/review", "Review"],
  ["/upload", "Upload data"],
  ["/zoho/orders", "Zoho orders"],
  ["/log", "Decision log"],
  ["/results", "Results"],
] as const;

const MORE = [
  ["/rules", "Rules and settings"],
  ["/zoho/connection", "Zoho connection"],
  ["/zoho/mapping", "Zoho mapping"],
  ["/brand", "Brand kit"],
] as const;

function isActive(path: string, href: string) {
  if (href === "/") return path === "/" || path.startsWith("/sku/"); // SKU pages are opened from Home
  return path === href || path.startsWith(`${href}/`);
}

export default function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const moreActive = MORE.some(([href]) => isActive(path, href));

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="navrow">
      <nav className="navrow-inner" aria-label="Main">
        <div className="tabs">
          {TABS.map(([href, label]) => (
            <Link key={href} href={href} className={isActive(path, href) ? "active" : undefined} aria-current={isActive(path, href) ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </div>
        <div className="more" ref={box}>
          <button type="button" className={moreActive ? "active" : undefined} aria-expanded={open} aria-controls="more-menu" onClick={() => setOpen((o) => !o)}>
            More
            <svg className="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {open && (
            <ul id="more-menu" className="more-menu">
              {MORE.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className={isActive(path, href) ? "active" : undefined} aria-current={isActive(path, href) ? "page" : undefined}>{label}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
    </div>
  );
}
