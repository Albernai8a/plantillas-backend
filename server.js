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
// DATOS MOCK (Temporales)
// ============================================

const ticketsMock = [
  {
    TICKET: 5932,
    Referencia: "1610 SXT ST",
    Material: "NOBUCK",
    Color: "NEGRO",
    LOTE: 417,
    FECHA_DE_ENTREGA: "2025-09-01",
    ESTADO_TICKET: "NO PIEL / FORROS",
    ESTADO_SUELA: "TERMINADO",
    HORMA: "PADE/14793 4.5",
    PLANT_ARMADO: "PLANT PADE 14793 ALT 4.5 SHAN DOBLE BOTA",
    CLIENTE: "INVERSIONES STIVALI SAS",
    tallas: { T34: 0, T35: 0, T36: 2, T37: 2, T38: 2, T39: 3, T40: 0, T41: 0, T42: 0, T43: 0 },
    PARES: 9
  },
  {
    TICKET: 6222,
    Referencia: "1871 SXV SU",
    Material: "SEVILLA",
    Color: "MIEL",
    LOTE: 427,
    FECHA_DE_ENTREGA: "2025-08-23",
    ESTADO_TICKET: "GUARNICION",
    ESTADO_SUELA: "TERMINADO",
    HORMA: "SALMA/41035 2.5",
    PLANT_ARMADO: "PLANT SALMA 41035 ALT 2.5 SHAN DOBLE ZAPATO",
    CLIENTE: "SOBREMEDIDAS INV STIVALI",
    tallas: { T34: 0, T35: 1, T36: 0, T37: 0, T38: 1, T39: 1, T40: 0, T41: 0, T42: 0, T43: 0 },
    PARES: 3
  },
  {
    TICKET: 6638,
    Referencia: "2402 SXT ST",
    Material: "CARNAZA X FOLIA X ANTE",
    Color: "NEGRO X NEGRO X NEGRO",
    LOTE: 462,
    FECHA_DE_ENTREGA: "2025-10-30",
    ESTADO_TICKET: "MONTAJE",
    ESTADO_SUELA: "TERMINADO",
    HORMA: "INCA/E393 4.5",
    PLANT_ARMADO: "PLANT INCA E393 ALT 4.5 SHAN DOBLE",
    CLIENTE: "INVERSIONES STIVALI SAS",
    tallas: { T34: 0, T35: 1, T36: 1, T37: 2, T38: 2, T39: 1, T40: 1, T41: 1, T42: 0, T43: 0 },
    PARES: 9
  }
];

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

    const tickets = ticketsMock;

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

    // Enriquecer tickets
    const ticketsConPlantillas = tickets.map(ticket => {
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
          fecha_lista: null, // TODO: agregar campo en BD
          personal_asignado: plantilla.personal_asignado,
          proveedor: plantilla.proveedor,
          observaciones: plantilla.observaciones,
          tallas_fabricadas: [], // TODO: de tabla tallas_detalle
          tallas_compradas: []  // TODO: de tabla tallas_detalle
        };
      }

      return {
        ...ticket,
        HORMA: horma,
        HEEL: heel,
        plantilla: plantillaCompleta,
        tiene_plantilla: !!plantilla
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

    const ticket = ticketsMock.find(t => t.TICKET === ticketId);
    
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
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error obteniendo plantilla:', error);
      throw error;
    }

    const { horma, heel } = parseHormaHeel(ticket.HORMA);

    res.json({
      success: true,
      data: {
        ...ticket,
        HORMA: horma,
        HEEL: heel,
        plantilla: plantilla || null
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

// POST /api/plantillas - Registrar nueva plantilla
app.post('/api/plantillas', async (req, res) => {
  try {
    console.log('📥 POST /api/plantillas', req.body);

    const { 
      ticket_id, 
      tipo, 
      personal_asignado,
      proveedor,
      observaciones,
      tallas_fabricadas,
      tallas_compradas
    } = req.body;

    if (!ticket_id || !tipo) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: ticket_id y tipo'
      });
    }

    const ticketExiste = ticketsMock.some(t => t.TICKET === ticket_id);
    if (!ticketExiste) {
      return res.status(404).json({
        success: false,
        message: 'Ticket no encontrado'
      });
    }

    // Insertar plantilla
    const { data: plantilla, error } = await supabase
      .from('plantillas_registro')
      .insert({
        ticket_id,
        tipo_plantilla: tipo,
        estado: 'pendiente',
        personal_asignado: personal_asignado || null,
        proveedor: proveedor || null,
        observaciones: observaciones || null,
        fecha_registro: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error insertando plantilla:', error);
      throw error;
    }

    // Si es mixta, insertar detalles de tallas
    if (tipo === 'mixta' && plantilla.id) {
      const tallasInsert = [];
      
      if (tallas_fabricadas?.length) {
        tallas_fabricadas.forEach(talla => {
          tallasInsert.push({
            plantilla_registro_id: plantilla.id,
            talla: talla,
            cantidad: 1, // TODO: obtener de ticket
            tipo: 'fabricada'
          });
        });
      }
      
      if (tallas_compradas?.length) {
        tallas_compradas.forEach(talla => {
          tallasInsert.push({
            plantilla_registro_id: plantilla.id,
            talla: talla,
            cantidad: 1, // TODO: obtener de ticket
            tipo: 'comprada'
          });
        });
      }

      if (tallasInsert.length) {
        const { error: tallasError } = await supabase
          .from('plantillas_tallas_detalle')
          .insert(tallasInsert);

        if (tallasError) {
          console.error('Error insertando tallas:', tallasError);
        }
      }
    }

    console.log('✅ Plantilla creada:', plantilla.id);

    res.status(201).json({
      success: true,
      message: 'Plantilla registrada exitosamente',
      data: plantilla
    });

  } catch (error) {
    console.error('❌ Error en POST /api/plantillas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar plantilla',
      error: error.message
    });
  }
});

// PUT /api/tickets/:id/programar - Programar ticket
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

// PUT /api/tickets/:id/fabricada - Marcar como fabricada
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

// PUT /api/tickets/:id/lista - Marcar como lista
app.put('/api/tickets/:id/lista', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    console.log(`📥 PUT /api/tickets/${ticketId}/lista`);

    const { data, error } = await supabase
      .from('plantillas_registro')
      .update({
        estado: 'lista'
      })
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

// GET /api/programas - Listar programas
app.get('/api/programas', async (req, res) => {
  try {
    const { fecha } = req.query;
    console.log('📥 GET /api/programas', { fecha });

    let query = supabase
      .from('programacion_plantillas')
      .select('*')
      .order('fecha_programacion', { ascending: true });

    if (fecha) {
      query = query.eq('fecha_programacion', fecha);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Error en GET /api/programas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener programas',
      error: error.message
    });
  }
});

// POST /api/programas - Crear nuevo programa
app.post('/api/programas', async (req, res) => {
  try {
    const { fecha, operario } = req.body;
    console.log('📥 POST /api/programas', req.body);

    // TODO: Implementar lógica de creación de programa
    // Por ahora solo retorna éxito

    res.status(201).json({
      success: true,
      message: 'Programa creado',
      data: { fecha, operario }
    });

  } catch (error) {
    console.error('❌ Error en POST /api/programas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear programa',
      error: error.message
    });
  }
});

// GET /api/operarios
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

// GET /api/proveedores
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

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('💥 Error no manejado:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('\n🚀 ====================================');
  console.log(`   Servidor corriendo en puerto ${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV}`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log('   ====================================\n');
});