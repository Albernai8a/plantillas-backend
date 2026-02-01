require('dotenv').config();
const { ClientSecretCredential } = require('@azure/identity');

// Configurar proxy desde variables de entorno del sistema
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  const { ProxyAgent } = require('proxy-agent');
  const proxyAgent = new ProxyAgent();
  
  // Aplicar globalmente
  const originalFetch = global.fetch;
  global.fetch = (url, options = {}) => {
    return originalFetch(url, {
      ...options,
      agent: proxyAgent,
    });
  };
}

async function testAuth() {
  console.log('🔐 Probando autenticación (con soporte de proxy)...\n');
  
  try {
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET,
      {
        additionalPolicies: [{
          policy: {
            name: 'CustomProxyPolicy',
            sendRequest: async (request, next) => {
              console.log(`📡 Haciendo request a: ${request.url}`);
              return next(request);
            }
          },
          position: 'perCall'
        }]
      }
    );

    console.log('🔄 Obteniendo token...');
    const token = await credential.getToken('https://graph.microsoft.com/.default');
    
    console.log('\n✅ ¡Autenticación exitosa!');
    console.log(`Token: ${token.token.substring(0, 20)}...`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testAuth();