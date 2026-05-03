// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://tobypenner.com",

  fonts: [
    {
      provider: fontProviders.fontshare(),
      name: "Cabinet Grotesk",
      cssVariable: "--font-heading",
      weights: [700],
    },
    {
      provider: fontProviders.fontshare(),
      name: "Sentient",
      cssVariable: "--font-body",
      weights: [300, 500],
    },
  ],

  integrations: [sitemap()],
});
