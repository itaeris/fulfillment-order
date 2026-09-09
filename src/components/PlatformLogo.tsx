import { cn } from "@/lib/utils";

const LOGO: Record<"shopee" | "tiktok" | "tokopedia" | "jubelio", { src: string; alt: string }> = {
  shopee: { src: "/logo/shopee-logo.webp", alt: "Shopee" },
  tiktok: { src: "/logo/tiktok-logo.svg", alt: "TikTok" },
  tokopedia: { src: "/logo/tokopedia-logo.png", alt: "Tokopedia" },
  jubelio: { src: "/logo/jubelio-logo.webp", alt: "Jubelio" },
};

function LogoImage({
  platform,
  className,
}: {
  platform: keyof typeof LOGO;
  className?: string;
}) {
  const logo = LOGO[platform];
  return (
    <img
      src={logo.src}
      alt={logo.alt}
      className={cn(
        "h-6 sm:h-7 w-auto max-w-[7.5rem] object-contain object-left shrink-0",
        className
      )}
    />
  );
}

export function PlatformLogo({
  platform,
  className,
}: {
  platform: "shopee" | "tiktok" | "jubelio";
  className?: string;
}) {
  if (platform === "tiktok") {
    return (
      <span className="inline-flex items-center gap-2 sm:gap-2.5">
        <LogoImage platform="tiktok" className={className} />
        <LogoImage platform="tokopedia" className={className} />
      </span>
    );
  }

  return <LogoImage platform={platform} className={className} />;
}
