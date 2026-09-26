import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SignalPath AI Sales Agent",
    short_name: "SignalPath",
    description: "Evidence-first lead discovery, qualification, calling, and follow-up.",
    start_url: "/leads",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#07100d",
    theme_color: "#07100d",
    orientation: "any",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/signalpath-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/signalpath-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Leads", short_name: "Leads", url: "/leads" },
      { name: "Campaigns", short_name: "Campaigns", url: "/campaigns" },
    ],
  };
}
