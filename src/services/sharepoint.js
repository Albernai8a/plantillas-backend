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
    const FECHA_FINIZAJE_COL = 'FECHA RECIBIDO FINIZAJE';

    // Leer encabezados desde la FILA 2 (incluye celdas vacías para mantener índices correctos)
    const headers = [];
    const headerRow = worksheet.getRow(2);

    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const val = cell.value;
      headers[colNumber - 1] = val ? String(val).trim() : null;
    });

    // Calcular límite: hace 30 días desde hoy (sin hora)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hace30Dias = new Date(hoy);
    hace30Dias.setDate(hoy.getDate() - 30);

    // Leer datos desde la FILA 3 en adelante
    const tickets = [];

    worksheet.eachRow((row, rowNumber) => {
      // Saltar filas 1 y 2 (título y encabezados)
      if (rowNumber <= 2) return;

      // Construir objeto con TODAS las columnas
      const record = {};
      headers.forEach((header, idx) => {
        if (!header) return;
        const cell = row.getCell(idx + 1);
        let value = cell.value;

        // Extraer resultado si la celda contiene una fórmula
        if (value !== null && typeof value === 'object' && !(value instanceof Date) && value.result !== undefined) {
          value = value.result;
        }

        record[header] = value ?? null;
      });

      // Verificar que la fila tenga datos (al menos un TICKET)
      if (!record['TICKET']) return;

      // --- Filtro por FECHA RECIBIDO FINIZAJE ---
      const fechaRaw = record[FECHA_FINIZAJE_COL];
      const estaVacia = fechaRaw === null || fechaRaw === undefined || fechaRaw === '';

      if (!estaVacia) {
        let fecha = fechaRaw instanceof Date ? new Date(fechaRaw) : new Date(fechaRaw);

        if (!isNaN(fecha.getTime())) {
          fecha.setHours(0, 0, 0, 0);
          // Excluir si la fecha es más antigua que 30 días
          if (fecha < hace30Dias) return;
        }
      }
      // Si está vacía se incluye siempre

      tickets.push(record);
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
