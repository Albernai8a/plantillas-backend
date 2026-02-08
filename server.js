// ============================================
// BACKEND API - PLANTILLAS STIVALI v4.0
// Con soporte completo para cantidades en mixtas
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

function generarNumeroProgramacion() {
  const fecha = new Date();
  const year = fecha.getFullYear().toString().slice(-2);
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `${year}${month}${day}${random}`;
}

async function calcularEstadoMixta(plantillaId) {
  try {
    const { data: tallas, error } = await supabase
      .from('plantillas_tallas_detalle')
      .select('*')
      .eq('plantilla_registro_id', plantillaId);

    if (error || !tallas || tallas.length === 0) {
      console.log('⚠️ No hay tallas para plantilla:', plantillaId);
      return 'pendiente';
    }

    const totalTallas = tallas.length;
    const tallasListas = tallas.filter(t => t.estado === 'lista' || t.estado === 'recibida').length;
    const tallasPendientes = tallas.filter(t => t.estado === 'pendiente').length;

    console.log(`🔍 Estado mixta ${plantillaId}:`, {
      total: totalTallas,
      listas: tallasListas,
      pendientes: tallasPendientes
    });

    if (tallasListas === totalTallas) return 'lista';
    if (tallasPendientes === totalTallas) return 'pendiente';
    return 'parcial';

  } catch (error) {
    console.error('❌ Error calculando estado mixta:', error);
    return 'pendiente';
  }
}

// NUEVA: Obtener cantidades de plantilla mixta
async function obtenerCantidadesMixta(plantillaId) {
  try {
    const { data: tallas, error } = await supabase
      .from('plantillas_tallas_detalle')
      .select('talla, cantidad, tipo')
      .eq('plantilla_registro_id', plantillaId);

    if (error) {
      console.error('Error obteniendo cantidades mixta:', error);
      return { cantidades_fabricadas: {}, cantidades_compradas: {} };
    }

    const cantidades_fabricadas = {};
    const cantidades_compradas = {};

    tallas?.forEach(row => {
      if (row.tipo === 'fabricada') {
        cantidades_fabricadas[row.talla] = row.cantidad;
      } else if (row.tipo === 'comprada') {
        cantidades_compradas[row.talla] = row.cantidad;
      }
    });

    return { cantidades_fabricadas, cantidades_compradas };

  } catch (error) {
    console.error('❌ Error obteniendo cantidades mixta:', error);
    return { cantidades_fabricadas: {}, cantidades_compradas: {} };
  }
}

// ============================================
// SHAREPOINT SERVICE
// ============================================

const sharePointService = require('./src/services/sharepoint');

let ticketsCache = [];
let lastCacheUpdate = null;
const CACHE_DURATION = 5 * 60 * 1000;

async function getTickets() {
  if (ticketsCache.length > 0 && lastCacheUpdate &&
    Date.now() - lastCacheUpdate < CACHE_DURATION) {
    console.log('📦 Usando tickets cacheados');
    return ticketsCache;
  }

  try {
    console.log('🔄 Actualizando tickets desde SharePoint...');
    ticketsCache = await sharePointService.getTicketsWithCache();
    lastCacheUpdate = Date.now();
    return ticketsCache;
  } catch (error) {
    console.error('❌ Error obteniendo tickets de SharePoint:', error);
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

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// GET /api/tickets - CON CANTIDADES MIXTAS
app.get('/api/tickets', async (req, res) => {
  try {
    console.log('📥 GET /api/tickets');

    const tickets = await getTickets();

    const { data: plantillas, error } = await supabase
      .from('plantillas_registro')
      .select('*')
      .eq('activo', true);

    if (error) {
      console.error('Error obteniendo plantillas:', error);
      throw error;
    }

    const { data: programaciones, error: progError } = await supabase
      .from('programacion_plantillas')
      .select('*');

    if (progError) {
      console.error('Error obteniendo programaciones:', progError);
    }

    // Construir tickets con plantillas
    const ticketsConPlantillas = await Promise.all(tickets.map(async ticket => {
      const { horma, heel } = parseHormaHeel(ticket.HORMA);
      const plantilla = plantillas?.find(p => p.ticket_id === ticket.TICKET);
      const programacion = programaciones?.find(p => p.ticket_id === ticket.TICKET);

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

        // Si es mixta, agregar cantidades
        if (plantilla.tipo_plantilla === 'mixta') {
          const { cantidades_fabricadas, cantidades_compradas } = 
            await obtenerCantidadesMixta(plantilla.id);
          
          plantillaCompleta.cantidades_fabricadas = cantidades_fabricadas;
          plantillaCompleta.cantidades_compradas = cantidades_compradas;
        }
      }

      return {
        ...ticket,
        HORMA: horma,
        HEEL: heel,
        TACON: heel,
        plantilla: plantillaCompleta,
        tiene_plantilla: !!plantilla,
        estado_plantilla: plantilla?.estado || 'sin_plantilla',
        numero_programa: programacion?.numero_programacion || null
      };
    }));

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

app.get('/api/tickets/:id', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    console.log(`📥 GET /api/tickets/${ticketId}`);

    const tickets = await getTickets();
    const ticket = tickets.find(t => t.TICKET === ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket no encontrado'
      });
    }

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

    const { data: programacion } = await supabase
      .from('programacion_plantillas')
      .select('*')
      .eq('ticket_id', ticketId)
      .maybeSingle();

    const { horma, heel } = parseHormaHeel(ticket.HORMA);

    // Si es mixta, obtener cantidades
    let cantidadesMixta = null;
    if (plantilla && plantilla.tipo_plantilla === 'mixta') {
      cantidadesMixta = await obtenerCantidadesMixta(plantilla.id);
    }

    res.json({
      success: true,
      data: {
        ...ticket,
        HORMA: horma,
        HEEL: heel,
        TACON: heel,
        plantilla: plantilla ? {
          ...plantilla,
          ...cantidadesMixta
        } : null,
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

// POST /api/plantillas - CON SOPORTE PARA CANTIDADES
app.post('/api/plantillas', async (req, res) => {
  try {
    console.log('📥 POST /api/plantillas');
    console.log('  Body:', JSON.stringify(req.body, null, 2));

    const {
      ticket_id,
      tipo,
      tipo_plantilla,
      estado,
      personal_asignado,
      proveedor,
      observaciones,
      tallas_fabricadas,
      tallas_compradas,
      cantidades_fabricadas,  // NUEVO
      cantidades_compradas,   // NUEVO
      numero_programa,
      fecha_programacion,
      accion
    } = req.body;

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

      // Si es mixta, insertar CON CANTIDADES
      if (tipoNormalizado === 'mixta' && plantilla.id) {
        console.log('🔍 Procesando plantilla mixta con cantidades');
        const tallasInsert = [];

        // Usar cantidades_fabricadas si está disponible
        if (cantidades_fabricadas && Object.keys(cantidades_fabricadas).length > 0) {
          Object.entries(cantidades_fabricadas).forEach(([talla, cantidad]) => {
            tallasInsert.push({
              plantilla_registro_id: plantilla.id,
              talla: talla,
              cantidad: parseInt(cantidad),
              tipo: 'fabricada',
              estado: 'pendiente'
            });
          });
        } else if (tallas_fabricadas?.length) {
          // Fallback: usar arrays sin cantidades
          tallas_fabricadas.forEach(talla => {
            tallasInsert.push({
              plantilla_registro_id: plantilla.id,
              talla: talla,
              cantidad: 1,
              tipo: 'fabricada',
              estado: 'pendiente'
            });
          });
        }

        // Usar cantidades_compradas si está disponible
        if (cantidades_compradas && Object.keys(cantidades_compradas).length > 0) {
          Object.entries(cantidades_compradas).forEach(([talla, cantidad]) => {
            tallasInsert.push({
              plantilla_registro_id: plantilla.id,
              talla: talla,
              cantidad: parseInt(cantidad),
              tipo: 'comprada',
              estado: 'recibida'
            });
          });
        } else if (tallas_compradas?.length) {
          // Fallback: usar arrays sin cantidades
          tallas_compradas.forEach(talla => {
            tallasInsert.push({
              plantilla_registro_id: plantilla.id,
              talla: talla,
              cantidad: 1,
              tipo: 'comprada',
              estado: 'recibida'
            });
          });
        }

        if (tallasInsert.length) {
          console.log('📋 Insertando tallas:', tallasInsert);
          
          const { error: tallasError } = await supabase
            .from('plantillas_tallas_detalle')
            .insert(tallasInsert);

          if (tallasError) {
            console.error('❌ Error insertando tallas:', tallasError);
          } else {
            console.log('✅ Tallas mixtas insertadas:', tallasInsert.length);
            
            // Verificar que se guardaron
            const { data: verificacion } = await supabase
              .from('plantillas_tallas_detalle')
              .select('*')
              .eq('plantilla_registro_id', plantilla.id);
            
            console.log('🔍 Tallas guardadas en BD:', verificacion);
          }
        }
      }

      // Si es comprada, marcar directo como recibida
      if (tipoNormalizado === 'comprada') {
        await supabase
          .from('plantillas_registro')
          .update({ estado: 'recibida' })
          .eq('id', plantilla.id);

        plantilla.estado = 'recibida';
      }

      // Si es mixta, calcular estado
      if (tipoNormalizado === 'mixta' && plantilla.id) {
        const estadoCalculado = await calcularEstadoMixta(plantilla.id);
        console.log('  Estado calculado mixta:', estadoCalculado);

        await supabase
          .from('plantillas_registro')
          .update({ estado: estadoCalculado })
          .eq('id', plantilla.id);

        plantilla.estado = estadoCalculado;
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
      const numeroProg = numero_programa || generarNumeroProgramacion();

      console.log('📅 Programando ticket:', ticket_id, 'Programa:', numeroProg);

      // Si es mixta, solo programar tallas fabricadas
      if (plantillaExistente.tipo_plantilla === 'mixta') {
        console.log('  Mixta: Actualizando solo tallas fabricadas');
        await supabase
          .from('plantillas_tallas_detalle')
          .update({ estado: 'programada' })
          .eq('plantilla_registro_id', plantillaExistente.id)
          .eq('tipo', 'fabricada');
      }

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

      let nuevoEstado = 'programada';
      if (plantillaExistente.tipo_plantilla === 'mixta') {
        nuevoEstado = await calcularEstadoMixta(plantillaExistente.id);
        console.log('  Nuevo estado mixta:', nuevoEstado);
      }

      const { data: plantillaActualizada, error: updateError } = await supabase
        .from('plantillas_registro')
        .update({ estado: nuevoEstado })
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
      console.log('🏭 Marcando como fabricada:', ticket_id);

      if (plantillaExistente.tipo_plantilla === 'mixta') {
        console.log('  Mixta: Actualizando solo tallas fabricadas');
        await supabase
          .from('plantillas_tallas_detalle')
          .update({ estado: 'completada' })
          .eq('plantilla_registro_id', plantillaExistente.id)
          .eq('tipo', 'fabricada');
      }

      let nuevoEstado = 'completada';
      if (plantillaExistente.tipo_plantilla === 'mixta') {
        nuevoEstado = await calcularEstadoMixta(plantillaExistente.id);
        console.log('  Nuevo estado mixta:', nuevoEstado);
      }

      const { data, error } = await supabase
        .from('plantillas_registro')
        .update({
          estado: nuevoEstado,
          fecha_completacion_fabricacion: new Date().toISOString()
        })
        .eq('id', plantillaExistente.id)
        .select()
        .single();

      if (error) throw error;

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
      console.log('✅ Marcando como lista:', ticket_id);

      if (plantillaExistente.tipo_plantilla === 'mixta') {
        console.log('  Mixta: Marcando todas las tallas como listas');
        await supabase
          .from('plantillas_tallas_detalle')
          .update({ estado: 'lista' })
          .eq('plantilla_registro_id', plantillaExistente.id);
      }

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

    // CASO 5: Actualizar plantilla existente
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

app.get('/api/plantillas/:ticketId/tallas', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.ticketId);
    console.log(`📥 GET /api/plantillas/${ticketId}/tallas`);

    const { data: plantilla } = await supabase
      .from('plantillas_registro')
      .select('*')
      .eq('ticket_id', ticketId)
      .eq('activo', true)
      .single();

    if (!plantilla) {
      return res.status(404).json({
        success: false,
        message: 'Plantilla no encontrada'
      });
    }

    const { data: tallas, error } = await supabase
      .from('plantillas_tallas_detalle')
      .select('*')
      .eq('plantilla_registro_id', plantilla.id)
      .order('talla');

    if (error) throw error;

    res.json({
      success: true,
      data: {
        plantilla: plantilla,
        tallas: tallas || []
      }
    });

  } catch (error) {
    console.error('❌ Error en GET /api/plantillas/:ticketId/tallas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tallas',
      error: error.message
    });
  }
});

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

app.put('/api/tickets/:id/programar', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { operario, fecha_programacion } = req.body;

    console.log(`📥 PUT /api/tickets/${ticketId}/programar`);

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

    const numeroProgramacion = generarNumeroProgramacion();

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

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('💥 Error no manejado:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log('\n🚀 ====================================');
  console.log(`   Servidor corriendo en puerto ${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV}`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log('   ====================================\n');
});