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

async function testSharePointRead() {
  console.log('📊 Probando lectura de SharePoint...\n');
  
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const itemId = process.env.SHAREPOINT_ITEM_ID;
  
  try {
    // 1. Obtener metadata del archivo
    console.log('1️⃣ Obteniendo metadata del archivo...');
    const item = await graphClient
      .api(`/drives/${driveId}/items/${itemId}`)
      .get();
    
    console.log(`✅ Archivo encontrado: ${item.name}\n`);
    
    // 2. Descargar el archivo
    console.log('2️⃣ Descargando archivo...');
    const downloadUrl = item['@microsoft.graph.downloadUrl'];
    const axios = require('axios');
    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
    });
    console.log(`✅ Archivo descargado\n`);
    
    // 3. Procesar Excel
    console.log('3️⃣ Procesando Excel...');
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.data);
    
    // 4. Buscar la hoja "produccion"
    const worksheet = workbook.getWorksheet('produccion');
    
    if (!worksheet) {
      console.log('❌ No se encontró la hoja "produccion"');
      return;
    }
    
    console.log(`✅ Hoja encontrada: ${worksheet.name}`);
    console.log(`   Filas: ${worksheet.rowCount}\n`);
    
    // 5. Leer encabezados desde la FILA 2
    console.log('4️⃣ Encabezados (fila 2):\n');
    const headers = [];
    const headerRow = worksheet.getRow(2);
    
    headerRow.eachCell((cell, colNumber) => {
      const value = cell.value;
      headers.push(value);
      if (colNumber <= 30) { // Mostrar los primeros 30
        console.log(`   ${colNumber}. ${value}`);
      }
    });
    
    console.log(`\n   Total: ${headers.length} columnas\n`);
    
    // 6. Leer primeras 5 filas de datos (desde la fila 3)
    console.log('5️⃣ Primeras 5 filas de datos:\n');
    
    const data = [];
    let count = 0;
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // Saltar filas 1 y 2 (encabezados)
      if (count >= 5) return;
      
      const rowData = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          rowData[header] = cell.value;
        }
      });
      
      // Verificar que la fila tenga datos
      const hasData = Object.values(rowData).some(val => val !== null && val !== undefined && val !== '');
      
      if (hasData) {
        data.push(rowData);
        
        // Mostrar solo los campos más importantes
        const simplified = {
          TICKET: rowData.TICKET,
          Referencia: rowData.Referencia,
          Material: rowData.Material,
          Color: rowData.Color,
          HORMA: rowData.HORMA,
          PLANT_ARMADO: rowData.PLANT_ARMADO,
          T34: rowData.T34,
          T35: rowData.T35,
          T36: rowData.T36,
          T37: rowData.T37,
          T38: rowData.T38,
          T39: rowData.T39,
          T40: rowData.T40,
          T41: rowData.T41,
          T42: rowData.T42,
          T43: rowData.T43,
          PARES: rowData.PARES,
          ESTADO_TICKET: rowData.ESTADO_TICKET,
          CLIENTE: rowData.CLIENTE,
        };
        
        console.log(`Registro ${count + 1}:`);
        console.log(JSON.stringify(simplified, null, 2));
        console.log('');
        
        count++;
      }
    });
    
    console.log(`✅ Total de registros con datos: ${data.length}\n`);
    console.log('🎉 ¡Todo funciona correctamente!');
    console.log('Ahora actualiza el servidor para usar la fila 2 como encabezados.');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testSharePointRead();