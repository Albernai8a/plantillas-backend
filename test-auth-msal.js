require('dotenv').config();
const msal = require('@azure/msal-node');
const https = require('https');
const http = require('http');

// Detectar proxy del sistema
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;

let networkConfig = {};

if (proxyUrl) {
  console.log(`🌐 Usando proxy: ${proxyUrl}`);
  const { HttpProxyAgent } = require('http-proxy-agent');
  const { HttpsProxyAgent } = require('https-proxy-agent');
  
  networkConfig = {
    proxyUrl: proxyUrl,
  };
}

const config = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
  system: {
    networkClient: {
      timeout: 30000,
    },
    ...networkConfig,
  }
};

async function testAuth() {
  console.log('🔐 Probando autenticación con MSAL (con proxy)...\n');
  
  console.log('📋 Configuración:');
  console.log(`   Tenant: ${process.env.AZURE_TENANT_ID?.substring(0, 8)}...`);
  console.log(`   Client: ${process.env.AZURE_CLIENT_ID?.substring(0, 8)}...`);
  console.log(`   Proxy: ${proxyUrl || 'Ninguno detectado'}`);
  console.log(`   TLS Reject: ${process.env.NODE_TLS_REJECT_UNAUTHORIZED || '1'}\n`);
  
  try {
    const cca = new msal.ConfidentialClientApplication(config);
    
    const tokenRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
    };

    console.log('🔄 Obteniendo token...');
    const response = await cca.acquireTokenByClientCredential(tokenRequest);
    
    console.log('\n✅ ¡Autenticación exitosa!');
    console.log(`Token: ${response.accessToken.substring(0, 20)}...`);
    console.log(`Expira: ${new Date(response.expiresOn).toLocaleString()}`);
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Error:', error.errorCode || error.message);
    console.error('Detalles:', error);
    
    console.log('\n💡 Posibles soluciones:');
    console.log('1. Configurar proxy en variables de entorno:');
    console.log('   set HTTPS_PROXY=http://proxy.tuempresa.com:8080');
    console.log('2. Desactivar firewall temporalmente para testing');
    console.log('3. Contactar a TI para permitir acceso a:');
    console.log('   - login.microsoftonline.com');
    console.log('   - graph.microsoft.com');
    
    return false;
  }
}

testAuth();