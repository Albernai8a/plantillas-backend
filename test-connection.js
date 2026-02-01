require('dotenv').config();
const https = require('https');

const testUrls = [
  'login.microsoftonline.com',
  'graph.microsoft.com',
];

function testConnection(hostname) {
  return new Promise((resolve) => {
    console.log(`🔍 Probando conexión a ${hostname}...`);
    
    const options = {
      hostname: hostname,
      port: 443,
      path: '/',
      method: 'GET',
      timeout: 5000,
    };

    const req = https.request(options, (res) => {
      console.log(`✅ ${hostname} - Status: ${res.statusCode}`);
      resolve(true);
    });

    req.on('error', (error) => {
      console.log(`❌ ${hostname} - Error: ${error.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log(`❌ ${hostname} - Timeout`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function runTests() {
  console.log('🌐 Probando conectividad de red...\n');
  
  for (const url of testUrls) {
    await testConnection(url);
  }
  
  console.log('\n📋 Variables de entorno:');
  console.log(`TENANT_ID: ${process.env.AZURE_TENANT_ID ? '✅ Configurado' : '❌ Falta'}`);
  console.log(`CLIENT_ID: ${process.env.AZURE_CLIENT_ID ? '✅ Configurado' : '❌ Falta'}`);
  console.log(`CLIENT_SECRET: ${process.env.AZURE_CLIENT_SECRET ? '✅ Configurado' : '❌ Falta'}`);
}

runTests();