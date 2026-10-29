import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PharmiAI",
    short_name: "PharmiAI",
    description: "Medicine care assistant for families caring for elderly parents.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#eef9d9",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
