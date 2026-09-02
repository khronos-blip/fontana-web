const { test, expect } = require("@playwright/test");

const builtStorefront = "http://fontana.localhost:8768/";

test.use({ viewport: { width:390, height:844 }, deviceScaleFactor:2 });

function catalogState() {
  return {
    operations:{ verified:true, electricityEnabled:true },
    settings:{ stockTodayOpen:true },
    products:[
      {
        id:"ballerine", category:"cakes", name:"Torta Ballerine", price:12,
        image:"/assets/ballerine-fontana-pro.jpg", description:"Producto de prueba.",
        ingredients:"Harina de almendra.", weight:"180 G", visible:true, status:"available"
      },
      {
        id:"bottega-de-cecco-tortiglioni", category:"bottega", name:"De Cecco Tortiglioni", price:10,
        image:"assets/bottega/de-cecco-tortiglioni-fontana.jpg", description:"Pasta sin gluten.",
        ingredients:"Maíz, arroz integral y papa.", visible:true, status:"available"
      },
      {
        id:"imagen-remota", category:"snacks", name:"Imagen remota", price:10,
        image:"https://api.fontanasingluten.com/v1/images/imagen-remota", description:"Carga administrada.",
        ingredients:"Por confirmar.", visible:true, status:"available"
      }
    ],
    builders:{
      fonkies:{
        visible:true, status:"available", allowPreorder:true, minimumQuantity:4,
        flavors:[
          {name:"Chips de Chocolate Oscuro", image:"assets/fonkie-dark-chocolate-chips-fontana-pro.jpg", ingredients:"Harina de almendra."},
          {name:"Chispa de Chocolate Blanco", image:"assets/fonkie-white-chocolate-chips-fontana-pro.jpg", ingredients:"Harina de almendra."}
        ]
      },
      fomb:{
        visible:true, status:"available", allowPreorder:true,
        flavors:[
          {name:"Pistacho", image:"assets/fomb-pistachio-fontana-pro.jpg", ingredients:"Chocolate y pistacho."},
          {name:"Dubai", image:"assets/fomb-dubai-fontana-pro.jpg", ingredients:"Chocolate y pistacho."}
        ]
      }
    }
  };
}

async function openBuiltCatalog(page, state = catalogState()) {
  await page.route("https://api.fontanasingluten.com/v1/catalog", route => route.fulfill({
    status:200,
    contentType:"application/json",
    headers:{"access-control-allow-origin":"*"},
    body:JSON.stringify({state})
  }));
  await page.route("https://api.fontanasingluten.com/v1/images/imagen-remota", route => route.abort());
  await page.goto(builtStorefront);
  await expect(page.locator('[data-product-id="ballerine"]')).toHaveClass(/product-flip-ready/);
}

test("el catálogo administrado conserva srcset y deja las imágenes remotas como fallback", async ({ page }) => {
  await openBuiltCatalog(page);

  const representatives = [
    page.locator('[data-product-id="ballerine"] .product-media img'),
    page.locator('[data-product-id="bottega-de-cecco-tortiglioni"] .product-media img'),
    page.locator('.fonkie-gallery-card[data-flavor="Chips de Chocolate Oscuro"] img'),
    page.locator('.builder-gallery-card[data-flavor="Pistacho"] img')
  ];
  for (const image of representatives) {
    await expect(image).toHaveAttribute("loading", "lazy");
    await expect(image).toHaveAttribute("srcset", /assets\/responsive\/.+-(?:360|640|960)\.webp/);
    await expect(image).toHaveAttribute("sizes", /vw/);
    await expect(image).toHaveAttribute("data-full-src", /assets\//);
    const attributes = await image.evaluate(element => ({
      srcset:element.getAttribute("srcset"),
      full:element.dataset.fullSrc
    }));
    expect(attributes.srcset).not.toContain(attributes.full);
  }

  const compact = representatives[0];
  await compact.scrollIntoViewIfNeeded();
  await expect.poll(() => compact.evaluate(image => ({
    complete:image.complete,
    responsive:/\/assets\/responsive\/.+\.webp$/.test(image.currentSrc)
  }))).toEqual({complete:true,responsive:true});

  const remote = page.locator('[data-product-id="imagen-remota"] .product-media img');
  await expect(remote).toHaveAttribute("src", "https://api.fontanasingluten.com/v1/images/imagen-remota");
  await expect(remote).not.toHaveAttribute("srcset", /.+/);
  await expect(remote).not.toHaveAttribute("sizes", /.+/);
});

test("hover no descarga Bottega y la vista expandida termina en el original", async ({ page }) => {
  await openBuiltCatalog(page);
  const bottegaRequests = [];
  page.on("request", request => {
    if (request.resourceType() === "image" && request.url().includes("/assets/bottega/")) {
      bottegaRequests.push(request.url());
    }
  });

  const bottegaFilter = page.getByRole("button", {name:"Bottega",exact:true});
  await bottegaFilter.hover();
  await bottegaFilter.focus();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(bottegaRequests).toEqual([]);
  await expect(page.getByRole("button", {name:"Ver todo"})).toHaveClass(/active/);

  const card = page.locator('[data-product-id="ballerine"]');
  await card.scrollIntoViewIfNeeded();
  const image = card.locator(".product-front .product-media img");
  await expect.poll(() => image.evaluate(element => /\/assets\/responsive\/.+\.webp$/.test(element.currentSrc))).toBe(true);
  await card.locator(".product-front .product-media").click();
  await expect(card).toHaveClass(/product-expanded-open/);
  const expandedImage = card.locator(".product-back .product-expanded-media img");
  await expect.poll(() => expandedImage.evaluate(element => ({
    srcset:element.getAttribute("srcset"),
    original:/\/assets\/ballerine-fontana-pro\.jpg$/.test(element.currentSrc),
    complete:element.complete && element.naturalWidth > 0
  }))).toEqual({srcset:null,original:true,complete:true});
});

test("la primera carga fría mantiene un fondo lila hasta que la imagen esté pintada", async ({ browser }) => {
  const viewports = [
    { width:390, height:844 },
    { width:1366, height:900 }
  ];

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor:2 });
    const page = await context.newPage();
    let releaseCatalog;
    let releaseImage;
    const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
    const imageGate = new Promise(resolve => { releaseImage = resolve; });
    let imageRequests = 0;
    const state = catalogState();
    state.products.unshift({
      id:"pistacho", category:"cakes", name:"Torta de Pistacho y Frambuesa", price:60,
      image:"assets/pistachio-raspberry-fontana-v2.jpg", description:"Producto de prueba.",
      ingredients:"Harina de almendra.", weight:"1 KG", visible:true, status:"available"
    });
    const responsiveRoute = /\/assets\/responsive\/pistachio-raspberry-fontana-v2-[a-f0-9]+-(?:360|640|960)\.webp(?:\?.*)?$/;

    await page.route("https://api.fontanasingluten.com/v1/catalog", async route => {
      await catalogGate;
      await route.fulfill({
        status:200,
        contentType:"application/json",
        headers:{"access-control-allow-origin":"*"},
        body:JSON.stringify({state})
      });
    });
    await page.route(responsiveRoute, async route => {
      imageRequests += 1;
      await imageGate;
      await route.continue();
    });

    try {
      await page.goto(builtStorefront, { waitUntil:"domcontentloaded" });
      const staticCard = page.locator('[data-id="pistacho"]');
      await staticCard.scrollIntoViewIfNeeded();
      const staticMedia = staticCard.locator(".product-media");
      const staticImage = staticMedia.locator("img");
      await expect.poll(() => imageRequests).toBeGreaterThan(0);
      await expect(staticImage).toHaveAttribute("data-catalog-image-stability", "true");
      await expect.poll(() => staticImage.evaluate(image => ({
        pending:image.classList.contains("catalog-image-pending"),
        loading:image.closest(".product-media").classList.contains("catalog-image-loading"),
        opacity:getComputedStyle(image).opacity,
        background:getComputedStyle(image.closest(".product-media")).backgroundImage,
        ready:image.complete && image.naturalWidth > 0
      }))).toEqual({
        pending:true,
        loading:true,
        opacity:"0",
        background:expect.stringContaining("linear-gradient"),
        ready:false
      });

      releaseCatalog();
      const hydratedCard = page.locator('[data-product-id="pistacho"]');
      await expect(hydratedCard).toHaveClass(/product-flip-ready/);
      const hydratedImage = hydratedCard.locator(".product-front .product-media img");
      const blockedFrames = await hydratedImage.evaluate(async image => {
        const frames = [];
        for (let index = 0; index < 12; index += 1) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          const media = image.closest(".product-media");
          frames.push({
            pending:image.classList.contains("catalog-image-pending"),
            loading:media.classList.contains("catalog-image-loading"),
            opacity:getComputedStyle(image).opacity,
            background:getComputedStyle(media).backgroundImage,
            ready:image.complete && image.naturalWidth > 0
          });
        }
        return frames;
      });
      for (const frame of blockedFrames) {
        expect(frame.pending).toBe(true);
        expect(frame.loading).toBe(true);
        expect(frame.opacity).toBe("0");
        expect(frame.background).toContain("linear-gradient");
        expect(frame.ready).toBe(false);
      }

      releaseImage();
      await expect.poll(() => hydratedImage.evaluate(image => ({
        ready:image.complete && image.naturalWidth > 0,
        pending:image.classList.contains("catalog-image-pending"),
        loading:image.closest(".product-media").classList.contains("catalog-image-loading"),
        opacity:getComputedStyle(image).opacity
      }))).toEqual({ready:true,pending:false,loading:false,opacity:"1"});
    } finally {
      releaseCatalog?.();
      releaseImage?.();
      await context.close();
    }
  }
});

test("Bottega cambia al instante y conserva un marco estable hasta pintar la imagen", async ({ page }) => {
  let releaseResponsive;
  const responsiveGate = new Promise(resolve => { releaseResponsive = resolve; });
  let responsiveRequests = 0;
  const responsiveRoute = /\/assets\/responsive\/de-cecco-tortiglioni-fontana-[a-f0-9]+-(?:360|640|960)\.webp(?:\?.*)?$/;
  await page.route(responsiveRoute, async route => {
    responsiveRequests += 1;
    await responsiveGate;
    await route.continue();
  });

  try {
    await openBuiltCatalog(page);

    const cakesFilter = page.getByRole("button", {name:"Foncake · Tortas completas", exact:true});
    const bottegaFilter = page.getByRole("button", {name:"Bottega", exact:true});
    const cake = page.locator('[data-product-id="ballerine"]');
    const bottega = page.locator('[data-product-id="bottega-de-cecco-tortiglioni"]');
    const bottegaImage = bottega.locator(".product-front .product-media img");
    const bottegaMedia = bottega.locator(".product-front .product-media");

    await cakesFilter.click();
    await expect(cakesFilter).toHaveClass(/active/);
    await expect(cake).toBeVisible();
    await expect(bottega).toBeHidden();

    await bottegaFilter.click();
    await expect.poll(() => responsiveRequests, {timeout:10000}).toBeGreaterThan(0);

    await expect(bottegaFilter).toHaveClass(/active/);
    await expect(bottegaFilter).not.toHaveAttribute("aria-busy", /.+/);
    await expect(cake).toBeHidden();
    await expect(bottega).toBeVisible();
    await expect(bottegaImage).toHaveClass(/catalog-image-pending/);
    const loadingPaint = await bottegaImage.evaluate(image => ({
      opacity:getComputedStyle(image).opacity,
      transition:getComputedStyle(image).transitionDuration,
      background:getComputedStyle(image.closest(".product-media")).backgroundImage
    }));
    expect(loadingPaint).toEqual({
      opacity:"0",
      transition:"0s",
      background:expect.stringContaining("linear-gradient")
    });

    // A slow but valid response keeps the stable frame without blocking the
    // customer's navigation to the requested category.
    await page.waitForTimeout(1800);
    await expect(bottegaFilter).not.toHaveAttribute("aria-busy", /.+/);
    await expect(cake).toBeHidden();
    await expect(bottega).toBeVisible();
    await expect(bottegaImage).toHaveClass(/catalog-image-pending/);

    releaseResponsive();
    await expect(bottegaFilter).not.toHaveAttribute("aria-busy", /.+/);
    await expect(bottegaFilter).toHaveClass(/active/);
    await expect(cake).toBeHidden();
    await expect(bottega).toBeVisible();
    await expect.poll(() => bottegaImage.evaluate(image => ({
      complete:image.complete && image.naturalWidth > 0,
      opacity:getComputedStyle(image).opacity,
      pending:image.classList.contains("catalog-image-pending")
    }))).toEqual({complete:true,opacity:"1",pending:false});
    await expect(bottegaMedia).not.toHaveClass(/catalog-image-loading/);
    await expect(bottegaImage).toHaveAttribute("loading", "lazy");
  } finally {
    releaseResponsive?.();
    await page.unroute(responsiveRoute);
  }
});

test("Salados y Bebidas cambian al instante con un marco estable mientras carga la imagen", async ({ browser }) => {
  const scenarios = [
    {
      filterName:"Salado",
      filterValue:"salado",
      productId:"cachito-fit",
      image:"assets/cachito-fit-fontana-pro.jpg",
      responsiveRoute:/\/assets\/responsive\/cachito-fit-fontana-pro-[a-f0-9]+-(?:360|640|960)\.webp(?:\?.*)?$/
    },
    {
      filterName:"Bebida",
      filterValue:"beverages",
      productId:"agua-minalba-600",
      image:"assets/beverage-minalba-600-fontana-pro.jpg",
      responsiveRoute:/\/assets\/responsive\/beverage-minalba-600-fontana-pro-[a-f0-9]+-(?:360|640|960)\.webp(?:\?.*)?$/
    }
  ];

  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
    const page = await context.newPage();
    let releaseResponsive;
    const responsiveGate = new Promise(resolve => { releaseResponsive = resolve; });
    let responsiveRequests = 0;
    await page.route(scenario.responsiveRoute, async route => {
      responsiveRequests += 1;
      await responsiveGate;
      await route.continue();
    });

    try {
      const state = catalogState();
      state.products.push({
        id:scenario.productId,
        category:scenario.filterValue,
        name:scenario.filterName,
        price:10,
        image:scenario.image,
        description:"Producto de prueba.",
        ingredients:"Ingredientes de prueba.",
        visible:true,
        status:"available"
      });
      await openBuiltCatalog(page, state);
      const cakesFilter = page.getByRole("button", {name:"Foncake · Tortas completas", exact:true});
      const targetFilter = page.getByRole("button", {name:scenario.filterName, exact:true});
      const cake = page.locator('[data-product-id="ballerine"]');
      const cakeImage = cake.locator(".product-front .product-media img");
      const target = page.locator(`[data-product-id="${scenario.productId}"]`);
      const targetImage = target.locator(".product-front .product-media img");

      await cakesFilter.click();
      await expect(cakesFilter).not.toHaveAttribute("aria-busy", /.+/);
      await expect(cake).toBeVisible();
      await expect.poll(() => cakeImage.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      await expect(target).toBeHidden();

      await targetFilter.click();
      await expect.poll(() => responsiveRequests, {timeout:10000}).toBeGreaterThan(0);
      await expect(targetFilter).toHaveClass(/active/);
      await expect(targetFilter).not.toHaveAttribute("aria-busy", /.+/);
      await expect(cake).toBeHidden();
      await expect(target).toBeVisible();
      await expect(targetImage).toHaveClass(/catalog-image-pending/);
      await expect(targetImage).toHaveCSS("opacity", "0");

      releaseResponsive();
      await expect(targetFilter).not.toHaveAttribute("aria-busy", /.+/);
      await expect(cake).toBeHidden();
      await expect(target).toBeVisible();
      await expect.poll(() => targetImage.evaluate(image => ({
        ready:image.complete && image.naturalWidth > 0,
        pending:image.classList.contains("catalog-image-pending"),
        opacity:getComputedStyle(image).opacity
      }))).toEqual({ready:true,pending:false,opacity:"1"});
    } finally {
      releaseResponsive?.();
      await context.close();
    }
  }
});

test("los clics rápidos conservan solo el último filtro solicitado", async ({ page }) => {
  const state = catalogState();
  state.products.push(
    {
      id:"cachito-fit",
      category:"salado",
      name:"Cachito fit",
      price:10,
      image:"assets/cachito-fit-fontana-pro.jpg",
      visible:true,
      status:"available"
    },
    {
      id:"agua-minalba-600",
      category:"beverages",
      name:"Agua Minalba 600 ml",
      price:10,
      image:"assets/beverage-minalba-600-fontana-pro.jpg",
      visible:true,
      status:"available"
    }
  );
  const gates = [
    {
      key:"bottega",
      route:/\/assets\/responsive\/de-cecco-tortiglioni-fontana-[a-f0-9]+-(?:360|640|960)\.webp(?:\?.*)?$/
    },
    {
      key:"salado",
      route:/\/assets\/responsive\/cachito-fit-fontana-pro-[a-f0-9]+-(?:360|640|960)\.webp(?:\?.*)?$/
    },
    {
      key:"beverages",
      route:/\/assets\/responsive\/beverage-minalba-600-fontana-pro-[a-f0-9]+-(?:360|640|960)\.webp(?:\?.*)?$/
    }
  ];
  const releases = {};
  const requests = {bottega:0,salado:0,beverages:0};
  for (const gate of gates) {
    const pending = new Promise(resolve => { releases[gate.key] = resolve; });
    await page.route(gate.route, async route => {
      requests[gate.key] += 1;
      await pending;
      await route.continue();
    });
  }

  try {
    await openBuiltCatalog(page, state);
    const cake = page.locator('[data-product-id="ballerine"]');
    const bottega = page.locator('[data-product-id="bottega-de-cecco-tortiglioni"]');
    const salado = page.locator('[data-product-id="cachito-fit"]');
    const beverage = page.locator('[data-product-id="agua-minalba-600"]');
    const bottegaFilter = page.getByRole("button", {name:"Bottega", exact:true});
    const saladoFilter = page.getByRole("button", {name:"Salado", exact:true});
    const beverageFilter = page.getByRole("button", {name:"Bebida", exact:true});
    const cakesFilter = page.getByRole("button", {name:"Foncake · Tortas completas", exact:true});

    await cakesFilter.click();
    await expect(cakesFilter).not.toHaveAttribute("aria-busy", /.+/);
    await bottegaFilter.click();
    await expect.poll(() => requests.bottega, {timeout:10000}).toBeGreaterThan(0);
    await saladoFilter.click();
    await expect.poll(() => requests.salado, {timeout:10000}).toBeGreaterThan(0);
    await beverageFilter.click();
    await expect.poll(() => requests.beverages, {timeout:10000}).toBeGreaterThan(0);
    await beverageFilter.click();

    await expect(beverageFilter).toHaveClass(/active/);
    await expect(beverageFilter).not.toHaveAttribute("aria-busy", /.+/);
    await expect(bottegaFilter).not.toHaveAttribute("aria-busy", /.+/);
    await expect(saladoFilter).not.toHaveAttribute("aria-busy", /.+/);
    await expect(cake).toBeHidden();
    await expect(bottega).toBeHidden();
    await expect(salado).toBeHidden();
    await expect(beverage).toBeVisible();

    releases.bottega();
    releases.salado();
    await page.waitForTimeout(250);
    await expect(beverageFilter).not.toHaveAttribute("aria-busy", /.+/);
    await expect(cake).toBeHidden();
    await expect(bottega).toBeHidden();
    await expect(salado).toBeHidden();
    await expect(beverage).toBeVisible();

    releases.beverages();
    await expect(beverageFilter).not.toHaveAttribute("aria-busy", /.+/);
    await expect(cake).toBeHidden();
    await expect(bottega).toBeHidden();
    await expect(salado).toBeHidden();
    await expect(beverage).toBeVisible();
  } finally {
    Object.values(releases).forEach(release => release?.());
    for (const gate of gates) await page.unroute(gate.route);
  }
});

test("una imagen atascada no bloquea el filtro ni muestra un cuadro negro", async ({ page }) => {
  let releaseResponsive;
  const responsiveGate = new Promise(resolve => { releaseResponsive = resolve; });
  let responsiveRequests = 0;
  const responsiveRoute = /\/assets\/responsive\/de-cecco-tortiglioni-fontana-[a-f0-9]+-(?:360|640|960)\.webp(?:\?.*)?$/;
  await page.route(responsiveRoute, async route => {
    responsiveRequests += 1;
    await responsiveGate;
    await route.abort();
  });

  try {
    await openBuiltCatalog(page);
    const cake = page.locator('[data-product-id="ballerine"]');
    const bottega = page.locator('[data-product-id="bottega-de-cecco-tortiglioni"]');
    const image = bottega.locator(".product-front .product-media img");
    const filter = page.getByRole("button", {name:"Bottega", exact:true});
    const cakesFilter = page.getByRole("button", {name:"Foncake · Tortas completas", exact:true});

    await cakesFilter.click();
    await expect(cakesFilter).not.toHaveAttribute("aria-busy", /.+/);
    await filter.click();
    await expect.poll(() => responsiveRequests, {timeout:10000}).toBeGreaterThan(0);
    await expect(filter).not.toHaveAttribute("aria-busy", /.+/);
    await expect(cake).toBeHidden();
    await expect(bottega).toBeVisible();
    await page.waitForTimeout(1800);
    await expect(filter).not.toHaveAttribute("aria-busy", /.+/);
    await expect(cake).toBeHidden();
    await expect(bottega).toBeVisible();
    releaseResponsive();
    await expect(image).toHaveAttribute("loading", "lazy");
    await expect(image).toHaveClass(/catalog-image-pending/);
    await expect(image).toHaveCSS("opacity", "0");
  } finally {
    releaseResponsive?.();
    await page.unroute(responsiveRoute);
  }
});

test("volver a Bottega ya cargada no oculta la imagen ni repite su descarga", async ({ page }) => {
  const bottegaRequests = [];
  page.on("request", request => {
    if (request.resourceType() === "image" && /\/assets\/(?:responsive\/)?de-cecco-tortiglioni-fontana-?/.test(request.url())) {
      bottegaRequests.push(request.url());
    }
  });
  await openBuiltCatalog(page);

  const cakesFilter = page.getByRole("button", {name:"Foncake · Tortas completas", exact:true});
  const bottegaFilter = page.getByRole("button", {name:"Bottega", exact:true});
  const bottega = page.locator('[data-product-id="bottega-de-cecco-tortiglioni"]');
  const bottegaImage = bottega.locator(".product-front .product-media img");

  await cakesFilter.click();
  await expect(cakesFilter).toHaveClass(/active/);
  await bottegaFilter.click();
  await expect(bottegaFilter).toHaveClass(/active/);
  await expect(bottega).toBeVisible();
  await expect.poll(() => bottegaImage.evaluate(image => ({
    complete:image.complete && image.naturalWidth > 0,
    opacity:getComputedStyle(image).opacity,
    pending:image.classList.contains("catalog-image-pending")
  }))).toEqual({complete:true,opacity:"1",pending:false});
  expect(bottegaRequests.length).toBeGreaterThan(0);

  const loadedSource = await bottegaImage.evaluate(image => image.currentSrc);
  const requestCountAfterLoad = bottegaRequests.length;
  await cakesFilter.click();
  await expect(cakesFilter).toHaveClass(/active/);

  const frames = await page.evaluate(async () => {
    const filter = [...document.querySelectorAll(".filter")]
      .find(button => button.dataset.filter === "bottega");
    const card = document.querySelector('[data-product-id="bottega-de-cecco-tortiglioni"]');
    const media = card.querySelector(".product-front .product-media");
    const image = media.querySelector("img");
    filter.click();
    const samples = [];
    for (let index = 0; index < 12; index += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      samples.push({
        active:filter.classList.contains("active"),
        hidden:card.classList.contains("hidden"),
        opacity:getComputedStyle(image).opacity,
        pending:image.classList.contains("catalog-image-pending"),
        loading:media.classList.contains("catalog-image-loading"),
        currentSrc:image.currentSrc
      });
    }
    return samples;
  });

  expect(frames.some(frame => frame.active && !frame.hidden)).toBe(true);
  for (const frame of frames) {
    expect(frame.opacity).toBe("1");
    expect(frame.pending).toBe(false);
    expect(frame.loading).toBe(false);
    expect(frame.currentSrc).toBe(loadedSource);
  }
  await expect(bottegaFilter).toHaveClass(/active/);
  await expect(bottega).toBeVisible();
  expect(bottegaRequests).toHaveLength(requestCountAfterLoad);
});

async function expectResponsiveFlavorPromotion(page, scenario) {
  let releaseOriginal;
  const originalGate = new Promise(resolve => { releaseOriginal = resolve; });
  let originalRequests = 0;
  await page.route(scenario.originalRoute, async route => {
    originalRequests += 1;
    await originalGate;
    await route.continue();
  });

  try {
    await openBuiltCatalog(page);
    await page.getByRole("button", {name:scenario.filter, exact:true}).click();
    const source = page.locator(scenario.card).first();
    await source.scrollIntoViewIfNeeded();
    await source.click();
    const overlay = page.locator(".builder-flavor-flip-card");
    const cue = overlay.locator(".builder-flavor-swipe-cue");
    await expect(cue).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(overlay).toHaveAttribute("data-flavor", scenario.nextFlavor, {timeout:2000});
    const expandedImage = overlay.locator(".builder-flavor-expanded-media img");
    await expect.poll(() => expandedImage.evaluate(element => ({
      source:element.currentSrc,
      srcset:element.getAttribute("srcset"),
      visible:getComputedStyle(element).opacity === "1",
      complete:element.complete && element.naturalWidth > 0
    }))).toMatchObject({
      source:expect.stringMatching(scenario.previewPattern),
      srcset:null,
      visible:true,
      complete:true
    });
    await expect.poll(() => originalRequests).toBeGreaterThan(0);

    releaseOriginal();
    await expect.poll(() => expandedImage.evaluate(element => element.currentSrc))
      .toMatch(scenario.originalPattern);
  } finally {
    releaseOriginal?.();
    await page.unroute(scenario.originalRoute);
  }
}

test("Fonkies cambia con WebP aunque el JPG original tarde y luego lo promueve", async ({ page }) => {
  await expectResponsiveFlavorPromotion(page, {
    filter:"Fonkies · Galletas",
    card:'.fonkie-gallery-card[data-flavor="Chips de Chocolate Oscuro"]',
    nextFlavor:"Chispa de Chocolate Blanco",
    originalRoute:"**/assets/fonkie-white-chocolate-chips-fontana-pro.jpg",
    previewPattern:/\/assets\/responsive\/fonkie-white-chocolate-chips-fontana-pro-[a-f0-9]{7}-(?:640|960)\.webp$/,
    originalPattern:/\/assets\/fonkie-white-chocolate-chips-fontana-pro\.jpg$/
  });
});

test("Fomb cambia con WebP aunque el JPG original tarde y luego lo promueve", async ({ page }) => {
  await expectResponsiveFlavorPromotion(page, {
    filter:"Fomb · Bombones",
    card:'.builder-gallery-card[data-flavor="Pistacho"]',
    nextFlavor:"Dubai",
    originalRoute:"**/assets/fomb-dubai-fontana-pro.jpg",
    previewPattern:/\/assets\/responsive\/fomb-dubai-fontana-pro-[a-f0-9]{7}-(?:640|960)\.webp$/,
    originalPattern:/\/assets\/fomb-dubai-fontana-pro\.jpg$/
  });
});
