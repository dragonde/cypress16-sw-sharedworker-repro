// MODE=native (Cypress 16 default network path) or MODE=http1 (forceHttp1, legacy proxy path).
const { defineConfig } = require("cypress");

module.exports = defineConfig({
  forceHttp1: process.env.MODE === "http1",
  video: false,
  screenshotOnRunFailure: false,
  e2e: {
    baseUrl: `${process.env.TLS === "1" ? "https" : "http"}://localhost:4300`,
    supportFile: false,
    specPattern: "cypress/e2e/**/*.cy.js",
    expose: { ITERATIONS: Number(process.env.ITERATIONS || 5), DWELL_MS: Number(process.env.DWELL_MS || 5000), INTERCEPT: process.env.INTERCEPT === "1", RESET: process.env.RESET === "1" },
    setupNodeEvents(on) {
      // CHROME_ARGS="--a --b": extra Chrome flags, e.g. --enable-logging --log-file=/abs/path
      on("before:browser:launch", (browser, launchOptions) => {
        if (browser.family !== "chromium") return launchOptions;
        // the TLS mode uses a self-signed cert; Chrome refuses to register a service worker over it otherwise
        if (process.env.TLS === "1") launchOptions.args.push("--ignore-certificate-errors");
        if (process.env.CHROME_ARGS) launchOptions.args.push(...process.env.CHROME_ARGS.split(" "));
        return launchOptions;
      });
      on("task", {
        mark(msg) {
          console.log(`[mark] ${msg}`);
          return null;
        },
      });
    },
  },
});
