import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SignalPath AI Sales Agent",
    short_name: "SignalPath",
    description: "Evidence-first lead discovery, qualification, calling, and follow-up.",
    start_url: "/leads",
    display: "standalone",
    background_color: "#07100d",
    theme_color: "#07100d",
    orientation: "any",
    icons: [
      {
        src: "/signalpath-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
