require('dotenv').config();
const { ClientSecretCredential } = require('@azure/identity');

async function testAuth() {
  console.log('🔐 Probando autenticación con Azure AD...\n');
  
  console.log('📋 Usando credenciales:');
  console.log(`TENANT_ID: ${process.env.AZURE_TENANT_ID?.substring(0, 8)}...`);
  console.log(`CLIENT_ID: ${process.env.AZURE_CLIENT_ID?.substring(0, 8)}...`);
  console.log(`CLIENT_SECRET: ${process.env.AZURE_CLIENT_SECRET ? '***configurado***' : '❌ FALTA'}\n`);

  try {
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET
    );

    console.log('🔄 Obteniendo token de Microsoft Graph...');
    const token = await credential.getToken('https://graph.microsoft.com/.default');
    
    console.log('\n✅ ¡Autenticación exitosa!');
    console.log(`📝 Token obtenido (primeros 20 caracteres): ${token.token.substring(0, 20)}...`);
    console.log(`⏰ Expira en: ${new Date(token.expiresOnTimestamp).toLocaleString()}`);
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Error de autenticación:', error.message);
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
      console.log('\n💡 Problema de red detectado');
    } else if (error.message.includes('AADSTS7000215')) {
      console.log('\n💡 CLIENT_SECRET inválido o expirado');
      console.log('   Genera un nuevo Client Secret en Azure Portal');
    } else if (error.message.includes('AADSTS700016')) {
      console.log('\n💡 CLIENT_ID incorrecto');
    } else if (error.message.includes('AADSTS90002')) {
      console.log('\n💡 TENANT_ID incorrecto');
    }
    
    return false;
  }
}

testAuth();