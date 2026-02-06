// ============================================
// BACKEND API - PLANTILLAS STIVALI v2.0
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// CONFIGURACIÓN
// ============================================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Separar HORMA y HEEL
function parseHormaHeel(hormaString) {
  if (!hormaString) return { horma: null, heel: null };

  const parts = hormaString.split(' ');
  if (parts.length >= 2) {
    const heel = parts[parts.length - 1];
    const horma = parts.slice(0, -1).join(' ');
    return { horma, heel };
  }

  return { horma: hormaString, heel: null };
}

// Generar número de programa
function generarNumeroProgramacion() {
  const fecha = new Date();
  const year = fecha.getFullYear().toString().slice(-2);
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 100);
  return `${year}${month}${day}${random}`;
}

// ============================================
// SHAREPOINT SERVICE
// ============================================

const sharePointService = require('./src/services/sharepoint');

// Cache de tickets
let ticketsCache = [];
let lastCacheUpdate = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

async function getTickets() {
  // Si cache es reciente, usarlo
  if (ticketsCache.length > 0 && lastCacheUpdate &&
    Date.now() - lastCacheUpdate < CACHE_DURATION) {
    console.log('📦 Usando tickets cacheados');
    return ticketsCache;
  }

  // Actualizar cache
  try {
    console.log('🔄 Actualizando tickets desde SharePoint...');
    ticketsCache = await sharePointService.getTicketsWithCache();
    lastCacheUpdate = Date.now();
    return ticketsCache;
  } catch (error) {
    console.error('❌ Error obteniendo tickets de SharePoint:', error);

    // Si hay error pero tenemos cache viejo, usarlo
    if (ticketsCache.length > 0) {
      console.log('⚠️ Usando cache antiguo por error');
      return ticketsCache;
    }

    throw error;
  }
}

// ============================================
// ENDPOINTS
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// GET /api/tickets - Obtener todos los tickets
app.get('/api/tickets', async (req, res) => {
  try {
    console.log('📥 GET /api/tickets');

    // 1. Obtener tickets de SharePoint
    const tickets = await getTickets();

    // 2. Obtener plantillas de Supabase
    const { data: plantillas, error } = await supabase
      .from('plantillas_registro')
      .select('*')
      .eq('activo', true);

    if (error) {
      console.error('Error obteniendo plantillas:', error);
      throw error;
    }

    // 3. Obtener programaciones
    const { data: programaciones, error: progError } = await supabase
      .from('programacion_plantillas')
      .select('*');

    if (progError) {
      console.error('Error obteniendo programaciones:', progError);
    }

    // 4. Combinar tickets con plantillas y programaciones
    const ticketsConPlantillas = tickets.map(ticket => {
      // Separar HORMA y HEEL
      const { horma, heel } = parseHormaHeel(ticket.HORMA);

      // Buscar plantilla para este ticket
      const plantilla = plantillas?.find(p => p.ticket_id === ticket.TICKET);

      // Buscar programación para este ticket
      const programacion = programaciones?.find(p => p.ticket_id === ticket.TICKET);

      // Construir objeto plantilla completo
      let plantillaCompleta = null;
      if (plantilla) {
        plantillaCompleta = {
          id: plantilla.id,
          tipo: plantilla.tipo_plantilla,
          estado: plantilla.estado,
          numero_programa: programacion?.numero_programacion || null,
          fecha_programacion: programacion?.fecha_programacion || null,
          fecha_fabricacion: plantilla.fecha_completacion_fabricacion || null,
          personal_asignado: plantilla.personal_asignado || null,
          proveedor: plantilla.proveedor || null,
          observaciones: plantilla.observaciones || null
        };
      }

      return {
        ...ticket,
        HORMA: horma,
        HEEL: heel,
        TACON: heel, // Alias para compatibilidad con frontend
        plantilla: plantillaCompleta,
        tiene_plantilla: !!plantilla,
        estado_plantilla: plantilla?.estado || 'sin_plantilla',
        numero_programa: programacion?.numero_programacion || null
      };
    });

    console.log(`✅ ${ticketsConPlantillas.length} tickets enviados`);

    res.json({
      success: true,
      data: ticketsConPlantillas,
      meta: {
        total: ticketsConPlantillas.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error en GET /api/tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tickets',
      error: error.message
    });
  }
});

// GET /api/tickets/:id - Obtener un ticket específico
app.get('/api/tickets/:id', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    console.log(`📥 GET /api/tickets/${ticketId}`);

    // Buscar ticket
    const tickets = await getTickets();
    const ticket = tickets.find(t => t.TICKET === ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket no encontrado'
      });
    }

    // Obtener plantilla de Supabase
    const { data: plantilla, error } = await supabase
      .from('plantillas_registro')
      .select('*')
      .eq('ticket_id', ticketId)
      .eq('activo', true)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error obteniendo plantilla:', error);
      throw error;
    }

    // Obtener programación
    const { data: programacion } = await supabase
      .from('programacion_plantillas')
      .select('*')
      .eq('ticket_id', ticketId)
      .maybeSingle();

    const { horma, heel } = parseHormaHeel(ticket.HORMA);

    res.json({
      success: true,
      data: {
        ...ticket,
        HORMA: horma,
        HEEL: heel,
        TACON: heel,
        plantilla: plantilla || null,
        programacion: programacion || null
      }
    });

  } catch (error) {
    console.error('❌ Error en GET /api/tickets/:id:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ticket',
      error: error.message
    });
  }
});

// POST /api/plantillas - Registrar/actualizar plantilla (UNIFICADO Y FLEXIBLE)
app.post('/api/plantillas', async (req, res) => {
  try {
    console.log('📥 POST /api/plantillas');
    console.log('  ticket_id:', req.body.ticket_id);
    console.log('  tipo:', req.body.tipo);
    console.log('  tipo_plantilla:', req.body.tipo_plantilla);
    console.log('  accion:', req.body.accion);
    console.log('  tallas_fabricadas:', req.body.tallas_fabricadas);
    console.log('  tallas_compradas:', req.body.tallas_compradas);
    console.log('  Body completo:', JSON.stringify(req.body, null, 2));

    const {
      ticket_id,
      tipo,
      tipo_plantilla, // Lovable puede enviar esto
      estado,
      personal_asignado,
      proveedor,
      observaciones,
      tallas_fabricadas,
      tallas_compradas,
      numero_programa,
      fecha_programacion,
      accion // 'registrar' | 'programar' | 'fabricada' | 'lista'
    } = req.body;

    // Normalizar tipo (puede venir como "tipo" o "tipo_plantilla")
    const tipoNormalizado = tipo || tipo_plantilla;

    if (!ticket_id) {
      return res.status(400).json({
        success: false,
        message: 'ticket_id es requerido'
      });
    }

    const tickets = await getTickets();
    const ticketExiste = tickets.some(t => t.TICKET === ticket_id);
    if (!ticketExiste) {
      return res.status(404).json({
        success: false,
        message: 'Ticket no encontrado'
      });
    }

    // Verificar si ya existe una plantilla para este ticket
    const { data: plantillaExistente, error: checkError } = await supabase
      .from('plantillas_registro')
      .select('*')
      .eq('ticket_id', ticket_id)
      .eq('activo', true)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    let plantilla;
    let programacion;

    // AUTO-DETECTAR ACCIÓN si no viene explícita
    let accionDetectada = accion;

    if (!accionDetectada) {
      if (!plantillaExistente && tipoNormalizado) {
        accionDetectada = 'registrar';
      } else if (plantillaExistente && numero_programa) {
        accionDetectada = 'programar';
      }
    }

    console.log('🎯 Acción detectada:', accionDetectada);

    // CASO 1: Registrar nueva plantilla
    if (!plantillaExistente && (!accionDetectada || accionDetectada === 'registrar')) {
      const { data, error } = await supabase
        .from('plantillas_registro')
        .insert({
          ticket_id,
          tipo_plantilla: tipoNormalizado || 'fabricada',
          estado: estado || 'pendiente',
          personal_asignado: personal_asignado || null,
          proveedor: proveedor || null,
          observaciones: observaciones || null,
          fecha_registro: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error insertando plantilla:', error);
        throw error;
      }
      plantilla = data;

      // Si es mixta, insertar detalles de tallas
      console.log('🔍 Detectando tipo mixta:', {
        tipo: tipo,
        tipoNormalizado: tipoNormalizado,
        tieneTallasFabricadas: !!tallas_fabricadas?.length,
        tieneTallasCompradas: !!tallas_compradas?.length,
        plantillaId: plantilla.id
      });

      if (tipoNormalizado === 'mixta' && plantilla.id) {
        const tallasInsert = [];

        if (tallas_fabricadas?.length) {
          tallas_fabricadas.forEach(talla => {
            tallasInsert.push({
              plantilla_registro_id: plantilla.id,
              talla: talla,
              cantidad: 1,
              tipo: 'fabricada'
            });
          });
        }

        if (tallas_compradas?.length) {
          tallas_compradas.forEach(talla => {
            tallasInsert.push({
              plantilla_registro_id: plantilla.id,
              talla: talla,
              cantidad: 1,
              tipo: 'comprada'
            });
          });
        }

        if (tallasInsert.length) {
          await supabase
            .from('plantillas_tallas_detalle')
            .insert(tallasInsert);
        }
      }

      // Si es comprada, marcar directo como lista
      if (tipoNormalizado === 'comprada') {
        await supabase
          .from('plantillas_registro')
          .update({ estado: 'recibida' })  // ← NUEVO
          .eq('id', plantilla.id);

        plantilla.estado = 'lista';
      }

      console.log('✅ Plantilla registrada:', plantilla.id);

      return res.status(201).json({
        success: true,
        message: 'Plantilla registrada exitosamente',
        data: { plantilla }
      });
    }

    // CASO 2: Programar plantilla existente
    if (plantillaExistente && accionDetectada === 'programar') {
      // Generar número de programa
      const numeroProg = numero_programa || generarNumeroProgramacion();

      // Crear programación
      const { data: progData, error: progError } = await supabase
        .from('programacion_plantillas')
        .insert({
          ticket_id,
          plantilla_registro_id: plantillaExistente.id,
          numero_programacion: numeroProg,
          fecha_programacion: fecha_programacion || new Date().toISOString(),
          operario: personal_asignado || null,
          estado: 'programada'
        })
        .select()
        .single();

      if (progError) {
        console.error('❌ Error creando programación:', progError);
        throw progError;
      }
      programacion = progData;

      // Actualizar estado de plantilla
      const { data: plantillaActualizada, error: updateError } = await supabase
        .from('plantillas_registro')
        .update({ estado: 'programada' })
        .eq('id', plantillaExistente.id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Error actualizando plantilla:', updateError);
        throw updateError;
      }

      console.log('✅ Ticket programado:', numeroProg);

      return res.json({
        success: true,
        message: 'Ticket programado exitosamente',
        data: {
          plantilla: plantillaActualizada,
          programacion: programacion
        }
      });
    }

    // CASO 3: Marcar como fabricada
    if (plantillaExistente && accionDetectada === 'fabricada') {
      const { data, error } = await supabase
        .from('plantillas_registro')
        .update({
          estado: 'completada',
          fecha_completacion_fabricacion: new Date().toISOString()
        })
        .eq('id', plantillaExistente.id)
        .select()
        .single();

      if (error) throw error;

      // Actualizar programación
      await supabase
        .from('programacion_plantillas')
        .update({ estado: 'completada' })
        .eq('ticket_id', ticket_id);

      console.log('✅ Marcado como fabricada');

      return res.json({
        success: true,
        message: 'Plantilla marcada como fabricada',
        data: { plantilla: data }
      });
    }

    // CASO 4: Marcar como lista
    if (plantillaExistente && accionDetectada === 'lista') {
      const { data, error } = await supabase
        .from('plantillas_registro')
        .update({ estado: 'lista' })
        .eq('id', plantillaExistente.id)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Marcado como lista');

      return res.json({
        success: true,
        message: 'Plantilla marcada como lista',
        data: { plantilla: data }
      });
    }

    // CASO 5: Actualizar plantilla existente (sin acción específica)
    if (plantillaExistente) {
      const updates = {};

      if (tipoNormalizado) updates.tipo_plantilla = tipoNormalizado;
      if (estado) updates.estado = estado;
      if (personal_asignado !== undefined) updates.personal_asignado = personal_asignado;
      if (proveedor !== undefined) updates.proveedor = proveedor;
      if (observaciones !== undefined) updates.observaciones = observaciones;

      const { data, error } = await supabase
        .from('plantillas_registro')
        .update(updates)
        .eq('id', plantillaExistente.id)
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Plantilla actualizada',
        data: { plantilla: data }
      });
    }

    // Si llegamos aquí, algo raro pasó
    console.log('⚠️ Caso no manejado:', {
      plantillaExistente: !!plantillaExistente,
      accionDetectada,
      tipoNormalizado
    });

    return res.status(400).json({
      success: false,
      message: 'Acción no válida o datos incompletos',
      debug: {
        tiene_plantilla: !!plantillaExistente,
        accion: accionDetectada,
        tipo: tipoNormalizado
      }
    });

  } catch (error) {
    console.error('❌ Error en POST /api/plantillas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al procesar plantilla',
      error: error.message
    });
  }
});

// POST /api/refresh - Refrescar cache manualmente
app.post('/api/refresh', async (req, res) => {
  try {
    console.log('🔄 Forzando actualización de cache...');

    ticketsCache = [];
    lastCacheUpdate = null;

    const tickets = await getTickets();

    res.json({
      success: true,
      message: 'Cache actualizado',
      data: {
        tickets_count: tickets.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error refrescando cache:', error);
    res.status(500).json({
      success: false,
      message: 'Error al refrescar cache',
      error: error.message
    });
  }
});

// PUT /api/tickets/:id/programar - Programar ticket (LEGACY - mantener por compatibilidad)
app.put('/api/tickets/:id/programar', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { operario, fecha_programacion } = req.body;

    console.log(`📥 PUT /api/tickets/${ticketId}/programar`);

    // Verificar que existe la plantilla
    const { data: plantilla, error: plantillaError } = await supabase
      .from('plantillas_registro')
      .select('*')
      .eq('ticket_id', ticketId)
      .eq('activo', true)
      .single();

    if (plantillaError || !plantilla) {
      return res.status(404).json({
        success: false,
        message: 'Primero debe registrar la plantilla'
      });
    }

    // Generar número de programación
    const numeroProgramacion = generarNumeroProgramacion();

    // Crear programación
    const { data: programacion, error } = await supabase
      .from('programacion_plantillas')
      .insert({
        ticket_id: ticketId,
        plantilla_registro_id: plantilla.id,
        numero_programacion: numeroProgramacion,
        fecha_programacion: fecha_programacion || new Date().toISOString(),
        operario: operario,
        estado: 'programada'
      })
      .select()
      .single();

    if (error) throw error;

    // Actualizar estado de plantilla
    await supabase
      .from('plantillas_registro')
      .update({ estado: 'programada' })
      .eq('id', plantilla.id);

    console.log('✅ Ticket programado:', numeroProgramacion);

    res.json({
      success: true,
      message: 'Ticket programado exitosamente',
      data: programacion
    });

  } catch (error) {
    console.error('❌ Error en PUT /api/tickets/:id/programar:', error);
    res.status(500).json({
      success: false,
      message: 'Error al programar ticket',
      error: error.message
    });
  }
});

// PUT /api/tickets/:id/fabricada - Marcar como fabricada (LEGACY)
app.put('/api/tickets/:id/fabricada', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    console.log(`📥 PUT /api/tickets/${ticketId}/fabricada`);

    const { data, error } = await supabase
      .from('plantillas_registro')
      .update({
        estado: 'completada',
        fecha_completacion_fabricacion: new Date().toISOString()
      })
      .eq('ticket_id', ticketId)
      .eq('activo', true)
      .select()
      .single();

    if (error) throw error;

    // Actualizar programación
    await supabase
      .from('programacion_plantillas')
      .update({ estado: 'completada' })
      .eq('ticket_id', ticketId);

    console.log('✅ Marcado como fabricada');

    res.json({
      success: true,
      message: 'Plantilla marcada como fabricada',
      data: data
    });

  } catch (error) {
    console.error('❌ Error en PUT /api/tickets/:id/fabricada:', error);
    res.status(500).json({
      success: false,
      message: 'Error al marcar como fabricada',
      error: error.message
    });
  }
});

// PUT /api/tickets/:id/lista - Marcar como lista (LEGACY)
app.put('/api/tickets/:id/lista', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    console.log(`📥 PUT /api/tickets/${ticketId}/lista`);

    const { data, error } = await supabase
      .from('plantillas_registro')
      .update({ estado: 'lista' })
      .eq('ticket_id', ticketId)
      .eq('activo', true)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Marcado como lista');

    res.json({
      success: true,
      message: 'Plantilla marcada como lista',
      data: data
    });

  } catch (error) {
    console.error('❌ Error en PUT /api/tickets/:id/lista:', error);
    res.status(500).json({
      success: false,
      message: 'Error al marcar como lista',
      error: error.message
    });
  }
});

// GET /api/operarios - Obtener lista de operarios
app.get('/api/operarios', async (req, res) => {
  try {
    console.log('📥 GET /api/operarios');

    const { data, error } = await supabase
      .from('operarios')
      .select('*')
      .eq('activo', true)
      .order('nombre');

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Error en GET /api/operarios:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener operarios',
      error: error.message
    });
  }
});

// GET /api/proveedores - Obtener lista de proveedores
app.get('/api/proveedores', async (req, res) => {
  try {
    console.log('📥 GET /api/proveedores');

    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .eq('activo', true)
      .order('nombre');

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Error en GET /api/proveedores:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener proveedores',
      error: error.message
    });
  }
});

// ============================================
// 404 - Ruta no encontrada
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.path
  });
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error('💥 Error no manejado:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log('\n🚀 ====================================');
  console.log(`   Servidor corriendo en puerto ${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV}`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log('   ====================================\n');
});