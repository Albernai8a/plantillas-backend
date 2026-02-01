// Deshabilitar TODAS las verificaciones SSL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const msal = require('@azure/msal-node');
const axios = require('axios');

// Configurar axios globalmente para ignorar SSL
const https = require('https');
const httpsAgent = new https.Agent({  
  rejectUnauthorized: false,
  minVersion: 'TLSv1'
});

axios.defaults.httpsAgent = httpsAgent;

const config = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
  system: {
    networkClient: {
      timeout: 60000,
    },
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        console.log(`[MSAL] ${message}`);
      },
      piiLoggingEnabled: false,
      logLevel: 3, // Verbose
    }
  }
};

async function testAuth() {
  console.log('🔐 Probando autenticación (bypass SSL completo)...\n');
  
  try {
    const cca = new msal.ConfidentialClientApplication(config);
    
    const tokenRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
    };

    console.log('🔄 Obteniendo token...\n');
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    
    console.log('\n✅ ¡ÉXITO! Token obtenido');
    console.log(`Token: ${response.accessToken.substring(0, 30)}...`);
    console.log(`Expira: ${new Date(response.expiresOn).toLocaleString()}`);
    
    return response.accessToken;
    
  } catch (error) {
    console.error('\n❌ Falló incluso con bypass SSL');
    console.error('Error:', error.errorCode || error.message);
    console.error('\nStack completo:', error);
    return null;
  }
}

testAuth();