"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SiteScreen } from "@/types";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { normalizeExternalUrl } from "@/lib/normalizeUrl";
import { AuthBackground } from "@/components/AuthBackground";

export function SiteScreenView({ screen }: { screen: SiteScreen }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 relative overflow-hidden">
      <AuthBackground />

      <div className="auth-card-rise relative max-w-lg w-full">
        <div className="auth-glow-border rounded-card">
        <div className="card p-8 sm:p-10 text-center relative overflow-hidden z-[1]">
          <div
            className="absolute top-0 left-0 right-0 h-[2px] opacity-70"
            style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)" }}
          />

          {screen.image && isValidImageSrc(screen.image) && (
            <div className="relative w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-6">
              <div
                className="absolute inset-0 rounded-full blur-2xl opacity-40 animate-glow"
                style={{ background: "radial-gradient(circle, var(--color-accent), transparent 70%)" }}
              />
              <div className="relative w-full h-full rounded-full overflow-hidden ring-2 ring-accent/40">
                <Image src={safeImageSrc(screen.image)} alt="" fill className="object-cover" sizes="160px" />
              </div>
            </div>
          )}

          <h1
            className="text-2xl sm:text-3xl font-extrabold mb-3 tracking-tight auth-title-sheen bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(90deg, #fff, var(--color-accent-light), #fff)" }}
          >
            {screen.title}
          </h1>
          {screen.description && (
            <p className="text-white/50 whitespace-pre-line mb-8 leading-relaxed">{screen.description}</p>
          )}

          {screen.buttons.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {screen.buttons.map((btn, i) => {
                const isInternal = btn.link.startsWith("/");
                const className = `${
                  i === 0 ? "btn-primary hover:shadow-[0_0_24px_-4px_var(--color-accent)] transition-shadow" : "btn-secondary"
                } w-full py-2.5 text-sm flex items-center justify-center gap-1.5`;
                return isInternal ? (
                  <Link key={i} href={btn.link} className={className}>
                    {btn.text}
                  </Link>
                ) : (
                  <a key={i} href={normalizeExternalUrl(btn.link)} target="_blank" rel="noopener noreferrer" className={className}>
                    {btn.text} <ExternalLink size={13} />
                  </a>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
