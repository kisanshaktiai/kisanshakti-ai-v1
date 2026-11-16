const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const [name, width, height, suffix] of [['mobile',390,844,''],['desktop',1280,1000,''],['empty',390,844,'?empty']]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:8080/tests/soil/preview/index.html' + suffix);
    await page.getByText('West field', {exact:true}).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(name + ': horizontal overflow');
    if (!suffix) {
      await page.getByRole('button', {name:'15-30 cm',exact:true}).click();
      if (await page.getByRole('button', {name:'15-30 cm',exact:true}).getAttribute('aria-pressed') !== 'true') throw new Error('Depth selection failed');
    }
    await page.screenshot({ path: 'soil-' + name + '.png', fullPage: true });
  }
  await browser.close();
  if (errors.length) throw new Error(errors.join('\n'));
})();
