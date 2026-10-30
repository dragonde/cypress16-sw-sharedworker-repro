// Several cy.visit()s between two pages that share one SharedWorker. After each visit's dwell,
// the page's worker-message log is printed as one `VISIT {json}` line for analyze.py.

const ITERATIONS = Number(Cypress.expose("ITERATIONS") || 5);
const DWELL_MS = Number(Cypress.expose("DWELL_MS") || 5000);
const ROUTES = ["/", "/other", "/"];
const INTERCEPT = Boolean(Cypress.expose("INTERCEPT")); // register a cy.intercept route per visit, like a real suite
const RESET = Boolean(Cypress.expose("RESET")); // clear cookies/storage and make a cy.request per iteration

describe("SharedWorker across cy.visit", () => {
  for (let i = 1; i <= ITERATIONS; i++) {
    it(`iteration ${i}`, () => {
      if (RESET) {
        cy.clearAllCookies();
        cy.clearAllLocalStorage();
        cy.clearAllSessionStorage();
        cy.request("/api/context");
      }
      ROUTES.forEach((route) => {
        if (INTERCEPT) cy.intercept("GET", "**/api/data*").as("data");
        cy.visit(route);
        cy.wait(DWELL_MS);
        cy.window({ log: false }).then((win) => {
          const log = win.__log || [];
          const rec = {
            iteration: i,
            route,
            log: log.filter((x) => x.ev !== "in:PING" && x.ev !== "out:PONG" && x.ev !== "in:TICK").concat(
              log.filter((x) => x.ev === "in:PING").slice(0, 1).map((x) => ({ ...x, ev: "in:PING(first)" })),
              log.filter((x) => x.ev === "in:TICK").slice(0, 1).map((x) => ({ ...x, ev: "in:TICK(first)" }))
            ),
          };
          cy.task("mark", `VISIT ${JSON.stringify(rec)}`, { log: false });
        });
      });
    });
  }
});
