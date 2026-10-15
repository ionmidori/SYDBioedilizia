import { test, expect } from "@playwright/test";

/**
 * Blog smoke: the index links to prerendered articles served by /blog/[slug],
 * each with its JSON-LD, and an unknown slug is a 404 (dynamicParams = false).
 */

test("blog index lists articles and an article renders with valid JSON-LD", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/blog", { waitUntil: "load" });
  const firstArticle = page.locator('a[href^="/blog/"]').first();
  await expect(firstArticle).toBeVisible();
  const href = await firstArticle.getAttribute("href");

  const response = await page.goto(href!, { waitUntil: "load" });
  expect(response!.status()).toBeLessThan(400);
  await expect(page.locator("h1").first()).toBeVisible();

  const ld = await page
    .locator('script[type="application/ld+json"]')
    .first()
    .textContent();
  const graph = JSON.parse(ld ?? "{}")["@graph"] as Array<{ "@type": string }>;
  expect(graph.map((node) => node["@type"])).toEqual([
    "Article",
    "BreadcrumbList",
    "FAQPage",
  ]);

  expect(pageErrors.map((e) => e.message)).toEqual([]);
});

test("unknown blog slug is a 404", async ({ page }) => {
  const response = await page.goto("/blog/articolo-che-non-esiste");
  expect(response!.status()).toBe(404);
});
