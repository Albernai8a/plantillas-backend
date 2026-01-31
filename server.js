// ============================================
// BACKEND API - PLANTILLAS STIVALI
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

// Supabase Client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ============================================
// DATOS MOCK (Temporales)
// ============================================

// Por ahora usamos datos mock
// Después conectaremos a SharePoint
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
        HORMA: "SALMA/41035",
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
        HORMA: "INCA/E393",
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

        // 1. Obtener tickets (por ahora mock, después será de SharePoint)
        const tickets = ticketsMock;

        // 2. Obtener plantillas de Supabase
        const { data: plantillas, error } = await supabase
            .from('plantillas_registro')
            .select('*')
            .eq('activo', true);

        if (error) {
            console.error('Error obteniendo plantillas:', error);
            throw error;
        }

        // 3. Combinar tickets con sus plantillas
        const ticketsConPlantillas = tickets.map(ticket => ({
            ...ticket,
            plantilla: plantillas?.find(p => p.ticket_id === ticket.TICKET) || null,
            tiene_plantilla: plantillas?.some(p => p.ticket_id === ticket.TICKET) || false
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

// GET /api/tickets/:id - Obtener un ticket específico
app.get('/api/tickets/:id', async (req, res) => {
    try {
        const ticketId = parseInt(req.params.id);
        console.log(`📥 GET /api/tickets/${ticketId}`);

        // Buscar ticket
        const ticket = ticketsMock.find(t => t.TICKET === ticketId);

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
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no encontrado (OK)
            console.error('Error obteniendo plantilla:', error);
            throw error;
        }

        res.json({
            success: true,
            data: {
                ticket,
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
            tipo_plantilla,
            personal_asignado,
            proveedor,
            observaciones
        } = req.body;

        // Validaciones básicas
        if (!ticket_id || !tipo_plantilla) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos: ticket_id y tipo_plantilla'
            });
        }

        // Verificar que el ticket existe
        const ticketExiste = ticketsMock.some(t => t.TICKET === ticket_id);
        if (!ticketExiste) {
            return res.status(404).json({
                success: false,
                message: 'Ticket no encontrado'
            });
        }

        // Insertar en Supabase
        const { data, error } = await supabase
            .from('plantillas_registro')
            .insert({
                ticket_id,
                tipo_plantilla,
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

        console.log('✅ Plantilla creada:', data.id);

        res.status(201).json({
            success: true,
            message: 'Plantilla registrada exitosamente',
            data: data
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

// PATCH /api/plantillas/:id - Actualizar plantilla
app.patch('/api/plantillas/:id', async (req, res) => {
    try {
        const plantillaId = parseInt(req.params.id);
        console.log(`📥 PATCH /api/plantillas/${plantillaId}`, req.body);

        const updates = req.body;

        // Actualizar en Supabase
        const { data, error } = await supabase
            .from('plantillas_registro')
            .update(updates)
            .eq('id', plantillaId)
            .select()
            .single();

        if (error) {
            console.error('Error actualizando plantilla:', error);
            throw error;
        }

        console.log('✅ Plantilla actualizada:', plantillaId);

        res.json({
            success: true,
            message: 'Plantilla actualizada exitosamente',
            data: data
        });

    } catch (error) {
        console.error('❌ Error en PATCH /api/plantillas/:id:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar plantilla',
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
