import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Relative base works for GitHub Pages project sites and local preview.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
