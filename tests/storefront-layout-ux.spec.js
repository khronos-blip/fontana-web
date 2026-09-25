const {test,expect}=require('@playwright/test');

for(const width of [320,390,768,1440])test(`Sabores a ${width}px: nombres legibles y controles táctiles sin compresión`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/');
  await page.locator('[data-filter="fonkies"]').click();
  const panel=page.locator('.fonkie-builder .choice-panel').filter({has:page.locator('.fonkie-flavors')});
  await panel.locator('summary').click();
  const metrics=await panel.locator('.fonkie-flavor').evaluateAll(rows=>rows.map(row=>{
    const name=row.querySelector('.fonkie-flavor-name'),button=row.querySelector('.fonkie-stepper button'),textRect=name.getBoundingClientRect(),buttonRect=button.getBoundingClientRect();
    return {textWidth:textRect.width,fontSize:parseFloat(getComputedStyle(name).fontSize),buttonWidth:buttonRect.width,buttonHeight:buttonRect.height,overflow:row.scrollWidth-row.clientWidth};
  }));
  expect(metrics.length).toBeGreaterThan(0);
  expect(metrics.every(m=>m.textWidth>=100&&m.fontSize>=13&&m.buttonWidth>=44&&m.buttonHeight>=44&&m.overflow<=1)).toBe(true);
  // Native scrollbars occupy layout width on Linux; compare the usable viewport.
  const viewport=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  expect(viewport.client).toBeGreaterThan(0);
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.client+1);
});
