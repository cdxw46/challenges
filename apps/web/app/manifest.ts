import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SMURFX",
    short_name: "SMURFX",
    description: "Move in blue",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#534AB7",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
