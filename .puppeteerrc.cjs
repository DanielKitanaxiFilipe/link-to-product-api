const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Altera o diretório de cache do Puppeteer para dentro do projeto,
  // permitindo que o Render o mantenha entre as builds.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
