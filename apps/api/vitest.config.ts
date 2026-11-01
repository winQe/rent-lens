import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The first test in a file starts PGlite (Postgres compiled to WebAssembly), runs the
    // migrations and loads the fixture. On CI runners that took just over the default 5 s.
    testTimeout: 20_000,
  },
});
