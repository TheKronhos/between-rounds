import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Regenerate icons after editing public/icon.svg: npm run icons
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#2f6f8f' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#2f6f8f' } },
  },
  images: ['public/icon.svg'],
});
