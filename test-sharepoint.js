require('dotenv').config();
const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');
const { TokenCredentialAuthenticationProvider } = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID,
  process.env.AZURE_CLIENT_ID,
  process.env.AZURE_CLIENT_SECRET
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

const graphClient = Client.initWithMiddleware({ authProvider });

async function findFile() {
  console.log('🔍 Buscando archivo PRODUCCION_2026.xlsm...\n');
  
  const siteId = process.env.SHAREPOINT_SITE_ID;
  
  try {
    // 1. Listar todos los drives del sitio
    console.log('1️⃣ Listando drives del sitio...');
    const drivesResponse = await graphClient
      .api(`/sites/${siteId}/drives`)
      .get();
    
    console.log(`✅ Encontrados ${drivesResponse.value.length} drives:\n`);
    
    drivesResponse.value.forEach((drive, index) => {
      console.log(`${index + 1}. 📁 ${drive.name}`);
      console.log(`   ID: ${drive.id}`);
      console.log(`   Tipo: ${drive.driveType}\n`);
    });
    
    // 2. Buscar el archivo en cada drive
    console.log('2️⃣ Buscando archivo en cada drive...\n');
    
    for (const drive of drivesResponse.value) {
      try {
        console.log(`📂 Buscando en: ${drive.name}...`);
        
        const searchResponse = await graphClient
          .api(`/drives/${drive.id}/root/search(q='PRODUCCION_2026.xlsm')`)
          .get();
        
        if (searchResponse.value.length > 0) {
          const file = searchResponse.value[0];
          
          console.log('\n🎯 ¡ARCHIVO ENCONTRADO!\n');
          console.log(`📁 Drive: ${drive.name}`);
          console.log(`📋 Drive ID: ${drive.id}`);
          console.log(`📄 Archivo: ${file.name}`);
          console.log(`📋 Item ID: ${file.id}`);
          console.log(`📏 Tamaño: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
          console.log(`📅 Última modificación: ${file.lastModifiedDateTime}`);
          console.log(`🔗 Ruta: ${file.parentReference?.path || 'N/A'}`);
          
          console.log('\n✅ Agrega estos valores a tu .env:\n');
          console.log(`SHAREPOINT_DRIVE_ID=${drive.id}`);
          console.log(`SHAREPOINT_ITEM_ID=${file.id}`);
          
          return;
        }
        
      } catch (error) {
        console.log(`   ⚠️ No se pudo buscar en este drive`);
      }
    }
    
    console.log('\n❌ Archivo no encontrado en ningún drive');
    console.log('\n💡 Verifica que el archivo se llame exactamente: PRODUCCION_2026.xlsm');
    console.log('💡 O busca manualmente en SharePoint y copia la ruta completa');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.statusCode === 404) {
      console.log('\n💡 El sitio no existe. Verifica SHAREPOINT_SITE_ID en .env');
    }
  }
}

findFile();