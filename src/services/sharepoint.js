const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
const { TokenCredentialAuthenticationProvider } = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');
const ExcelJS = require('exceljs');
const axios = require('axios');
require('isomorphic-fetch');

class SharePointService {
  constructor() {
    this.credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET
    );

    const authProvider = new TokenCredentialAuthenticationProvider(this.credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });

    this.client = Client.initWithMiddleware({ authProvider });
  }

  async getExcelData() {
    try {
      console.log('📥 Leyendo Excel de SharePoint...');

      const driveId = process.env.SHAREPOINT_DRIVE_ID;
      const itemId = process.env.SHAREPOINT_ITEM_ID;

      // 1. Obtener metadata del archivo
      const item = await this.client
        .api(`/drives/${driveId}/items/${itemId}`)
        .get();

      // 2. Obtener URL de descarga
      const downloadUrl = item['@microsoft.graph.downloadUrl'];

      // 3. Descargar el archivo
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
      });

      // 4. Procesar Excel con ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.data);

      // 5. Obtener la hoja "produccion"
      const worksheet = workbook.getWorksheet('produccion');

      if (!worksheet) {
        throw new Error('No se encontró la hoja "produccion" en el Excel');
      }

      // 6. Parsear los datos
      const data = this.parseExcelData(worksheet);

      console.log(`✅ ${data.length} registros leídos de SharePoint`);

      return data;

    } catch (error) {
      console.error('❌ Error leyendo SharePoint:', error);
      throw error;
    }
  }

  parseExcelData(worksheet) {
    // Leer encabezados desde la FILA 2
    const headers = [];
    const headerRow = worksheet.getRow(2);
    
    headerRow.eachCell((cell, colNumber) => {
      headers.push(cell.value);
    });

    // Crear mapa de índices de columnas
    const columnIndexes = {
      TICKET: headers.indexOf('TICKET'),
      Referencia: headers.indexOf('Referencia'),
      Material: headers.indexOf('Material'),
      Color: headers.indexOf('Color'),
      LOTE: headers.indexOf('LOTE'),
      FECHA_DE_ENTREGA: headers.indexOf('FECHA_DE_ENTREGA'),
      ESTADO_TICKET: headers.indexOf('ESTADO_TICKET'),
      ESTADO_SUELA: headers.indexOf('ESTADO_SUELA'),
      HORMA: headers.indexOf('HORMA'),
      HEEL: headers.indexOf('HEEL'),
      PLANT_ARMADO: headers.indexOf('PLANT_ARMADO'),
      CLIENTE: headers.indexOf('CLIENTE'),
      T34: headers.indexOf('T34'),
      T35: headers.indexOf('T35'),
      T36: headers.indexOf('T36'),
      T37: headers.indexOf('T37'),
      T38: headers.indexOf('T38'),
      T39: headers.indexOf('T39'),
      T40: headers.indexOf('T40'),
      T41: headers.indexOf('T41'),
      T42: headers.indexOf('T42'),
      T43: headers.indexOf('T43'),
      PARES: headers.indexOf('PARES')
    };

    // Leer datos desde la FILA 3 en adelante
    const tickets = [];

    worksheet.eachRow((row, rowNumber) => {
      // Saltar filas 1 y 2 (título y encabezados)
      if (rowNumber <= 2) return;

      const rowData = [];
      row.eachCell((cell, colNumber) => {
        rowData[colNumber - 1] = cell.value;
      });

      // Verificar que la fila tenga datos (al menos un TICKET)
      if (!rowData[columnIndexes.TICKET]) return;

      const ticket = {
        TICKET: parseInt(rowData[columnIndexes.TICKET]) || 0,
        Referencia: rowData[columnIndexes.Referencia] || '',
        Material: rowData[columnIndexes.Material] || '',
        Color: rowData[columnIndexes.Color] || '',
        LOTE: parseInt(rowData[columnIndexes.LOTE]) || 0,
        FECHA_DE_ENTREGA: rowData[columnIndexes.FECHA_DE_ENTREGA] || null,
        ESTADO_TICKET: rowData[columnIndexes.ESTADO_TICKET] || '',
        ESTADO_SUELA: rowData[columnIndexes.ESTADO_SUELA] || '',
        HORMA: rowData[columnIndexes.HORMA] || '',
        TACON: rowData[columnIndexes.HEEL] || '',
        PLANT_ARMADO: rowData[columnIndexes.PLANT_ARMADO] || '',
        CLIENTE: rowData[columnIndexes.CLIENTE] || '',
        tallas: {
          T34: parseInt(rowData[columnIndexes.T34]) || 0,
          T35: parseInt(rowData[columnIndexes.T35]) || 0,
          T36: parseInt(rowData[columnIndexes.T36]) || 0,
          T37: parseInt(rowData[columnIndexes.T37]) || 0,
          T38: parseInt(rowData[columnIndexes.T38]) || 0,
          T39: parseInt(rowData[columnIndexes.T39]) || 0,
          T40: parseInt(rowData[columnIndexes.T40]) || 0,
          T41: parseInt(rowData[columnIndexes.T41]) || 0,
          T42: parseInt(rowData[columnIndexes.T42]) || 0,
          T43: parseInt(rowData[columnIndexes.T43]) || 0
        },
        PARES: parseInt(rowData[columnIndexes.PARES]) || 0
      };

      tickets.push(ticket);
    });

    return tickets;
  }

  // Cache simple para no leer SharePoint en cada request
  async getTicketsWithCache() {
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

    if (this.cachedData && Date.now() - this.cacheTimestamp < CACHE_DURATION) {
      console.log('📦 Usando datos cacheados');
      return this.cachedData;
    }

    const data = await this.getExcelData();
    this.cachedData = data;
    this.cacheTimestamp = Date.now();

    return data;
  }

  // Método para forzar actualización del cache
  async refreshCache() {
    console.log('🔄 Actualizando cache forzosamente...');
    const data = await this.getExcelData();
    this.cachedData = data;
    this.cacheTimestamp = Date.now();
    return data;
  }

  // Limpiar cache
  clearCache() {
    console.log('🗑️ Limpiando cache...');
    this.cachedData = null;
    this.cacheTimestamp = null;
  }
}

module.exports = new SharePointService();
