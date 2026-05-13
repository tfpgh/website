// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import sitemap from "@astrojs/sitemap";

import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  site: "https://tobypenner.com",
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
  markdown: {
    shikiConfig: {
      theme: "css-variables",
    },
  },
  integrations: [sitemap(), mdx()],
  prefetch: {
    defaultStrategy: "viewport",
  },
  vite: {
    css: {
      transformer: "lightningcss",
    },
  },
});
