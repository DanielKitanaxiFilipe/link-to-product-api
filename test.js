require('dotenv').config();
const { getProduct } = require('./scraper');

async function test() {
  console.log('Iniciando o teste...');
  try {
    const data = await getProduct('https://www.zara.com/ao/pt/sapatilha-minimalista-p12200720.html?v1=549572433&v2=2443335');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Erro no teste:', err.message);
  }
}

test();
