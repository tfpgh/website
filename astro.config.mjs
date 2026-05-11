// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://tobypenner.com",
  redirects: {
    "/tag": {
      status: 302,
      destination: "https://www.youtube.com/watch?v=83YcsIVBEEk",
    },
  },
  fonts: [
    {
      provider: fontProviders.fontshare(),
      name: "Cabinet Grotesk",
      cssVariable: "--font-heading",
      weights: [700],
      styles: ["normal"],
      subsets: ["latin"],
    },
    {
      provider: fontProviders.fontshare(),
      name: "Sentient",
      cssVariable: "--font-body",
      weights: [300, 500],
      styles: ["normal"],
      subsets: ["latin"],
    },
  ],

  integrations: [sitemap()],
});
