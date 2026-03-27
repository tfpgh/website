// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://tobypenner.com",

  fonts: [
    {
      provider: fontProviders.fontshare(),
      name: "Switzer",
      cssVariable: "--font-heading",
      weights: [400, 500, 600, 700, 800, 900],
    },
    {
      provider: fontProviders.fontshare(),
      name: "Sentient",
      cssVariable: "--font-body",
    },
  ],

  integrations: [sitemap()],
});