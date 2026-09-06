import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    // Relative asset URLs. With the default '/' the build only works when served
    // from a domain root, which silently breaks on a GitHub project page
    // (username.github.io/dinozoa/) or any subfolder. './' costs nothing and makes
    // the same build run from anywhere.
    base: './',
    build: {
        rollupOptions: {
            // privacy.html is a second entry point, so Vite processes it too and
            // substitutes %VITE_SITE_URL% in its canonical tag.
            input: {
                main: resolve(__dirname, 'index.html'),
                privacy: resolve(__dirname, 'privacy.html'),
            },
        },
    },
});
