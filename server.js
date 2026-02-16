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
// CONFIGURACIÃ“N
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
// HELPER FUNCTIONS
// ============================================

// Separar HORMA y HEEL
function parseHormaHeel(hormaString) {
    if (!hormaString) return { horma: null, heel: null };
    
    const parts = hormaString.trim().split(' ');
    if (parts.length >= 2) {
        const heel = parts[parts.length - 1];
        const horma = parts.slice(0, -1).join(' ');
        return { horma, heel };
    }
    
    return { horma: hormaString, heel: null };
}

// Generar nÃºmero de programaciÃ³n
function generarNumeroProgramacion() {
    const fecha = new Date();
    const year = fecha.getFullYear().toString().slice(-2);
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 100);
    return `${year}${month}${day}${random}`;
}

// FunciÃ³n para obtener tickets (aquÃ­ se conectarÃ­a SharePoint)
async function getTickets() {
    // Por ahora retorna datos mock
    // TODO: Reemplazar con llamada a SharePoint
    return [
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
        console.log('ðŸ“¥ GET /api/tickets');

        // 1. Obtener tickets
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
            
            // Buscar programaciÃ³n para este ticket
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

        console.log(`âœ… ${ticketsConPlantillas.length} tickets enviados`);

        res.json({
            success: true,
            data: ticketsConPlantillas,
            meta: {
                total: ticketsConPlantillas.length,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('âŒ Error en GET /api/tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener tickets',
            error: error.message
        });
    }
});

// GET /api/tickets/:id - Obtener un ticket especÃ­fico
app.get('/api/tickets/:id', async (req, res) => {
    try {
        const ticketId = parseInt(req.params.id);
        console.log(`ðŸ“¥ GET /api/tickets/${ticketId}`);

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

        // Obtener programaciÃ³n
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
        console.error('âŒ Error en GET /api/tickets/:id:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener ticket',
            error: error.message
        });
    }
});

// POST /api/plantillas - Registrar/actualizar plantilla (UNIFICADO)
app.post('/api/plantillas', async (req, res) => {
    try {
        console.log('ðŸ“¥ POST /api/plantillas', req.body);

        const { 
            ticket_id, 
            tipo,
            estado,
            personal_asignado,
            proveedor,
            observaciones,
            tallas_fabricadas,
            tallas_compradas,
            numero_programa,
            numero_programacion,
            numeroProgramacion,
            fecha_programacion,
            accion // 'registrar' | 'programar' | 'fabricada' | 'lista'
        } = req.body;

        // Normalizar número de programa (soportar múltiples variantes)
        const numeroProgramaRecibido = numero_programa || numero_programacion || numeroProgramacion;
        
        console.log('🔍 Campos recibidos:', {
            accion,
            numero_programa,
            numero_programacion,
            numeroProgramacion,
            normalizado: numeroProgramaRecibido
        });

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

        // CASO 1: Registrar nueva plantilla
        if (!plantillaExistente && (!accion || accion === 'registrar')) {
            const { data, error } = await supabase
                .from('plantillas_registro')
                .insert({
                    ticket_id,
                    tipo_plantilla: tipo || 'fabricada',
                    estado: estado || 'pendiente',
                    personal_asignado: personal_asignado || null,
                    proveedor: proveedor || null,
                    observaciones: observaciones || null,
                    fecha_registro: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            plantilla = data;

            // Si es mixta, insertar detalles de tallas
            if (tipo === 'mixta' && plantilla.id) {
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
            if (tipo === 'comprada') {
                await supabase
                    .from('plantillas_registro')
                    .update({ estado: 'lista' })
                    .eq('id', plantilla.id);
                
                plantilla.estado = 'lista';
            }

            console.log('âœ… Plantilla registrada:', plantilla.id);

            return res.status(201).json({
                success: true,
                message: 'Plantilla registrada exitosamente',
                data: { plantilla }
            });
        }

        // CASO 2: Programar plantilla existente
        if (plantillaExistente && accion === 'programar') {
            // Generar nÃºmero de programa
            const numeroProg = numeroProgramaRecibido || generarNumeroProgramacion();
            
            console.log('📅 Programando:', {
                recibido: numeroProgramaRecibido,
                usando: numeroProg
            });

            // Crear programaciÃ³n
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

            if (progError) throw progError;
            programacion = progData;

            // Actualizar estado de plantilla
            const { data: plantillaActualizada, error: updateError } = await supabase
                .from('plantillas_registro')
                .update({ estado: 'programada' })
                .eq('id', plantillaExistente.id)
                .select()
                .single();

            if (updateError) throw updateError;

            console.log('âœ… Ticket programado:', numeroProg);

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
        if (plantillaExistente && accion === 'fabricada') {
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

            // Actualizar programaciÃ³n
            await supabase
                .from('programacion_plantillas')
                .update({ estado: 'completada' })
                .eq('ticket_id', ticket_id);

            console.log('âœ… Marcado como fabricada');

            return res.json({
                success: true,
                message: 'Plantilla marcada como fabricada',
                data: { plantilla: data }
            });
        }

        // CASO 4: Marcar como lista
        if (plantillaExistente && accion === 'lista') {
            const { data, error } = await supabase
                .from('plantillas_registro')
                .update({ estado: 'lista' })
                .eq('id', plantillaExistente.id)
                .select()
                .single();

            if (error) throw error;

            console.log('âœ… Marcado como lista');

            return res.json({
                success: true,
                message: 'Plantilla marcada como lista',
                data: { plantilla: data }
            });
        }

        // CASO 5: Actualizar plantilla existente (sin acciÃ³n especÃ­fica)
        if (plantillaExistente) {
            const updates = {};
            
            if (tipo) updates.tipo_plantilla = tipo;
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

        // Si llegamos aquÃ­, algo raro pasÃ³
        return res.status(400).json({
            success: false,
            message: 'AcciÃ³n no vÃ¡lida o datos incompletos'
        });

    } catch (error) {
        console.error('âŒ Error en POST /api/plantillas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al procesar plantilla',
            error: error.message
        });
    }
});

// PATCH /api/plantillas/:id - Actualizar plantilla
app.patch('/api/plantillas/:id', async (req, res) => {
    try {
        const plantillaId = parseInt(req.params.id);
        console.log(`ðŸ“¥ PATCH /api/plantillas/${plantillaId}`, req.body);

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

        console.log('âœ… Plantilla actualizada:', plantillaId);

        res.json({
            success: true,
            message: 'Plantilla actualizada exitosamente',
            data: data
        });

    } catch (error) {
        console.error('âŒ Error en PATCH /api/plantillas/:id:', error);
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
        console.log('ðŸ“¥ GET /api/operarios');

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
        console.error('âŒ Error en GET /api/operarios:', error);
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
        console.log('ðŸ“¥ GET /api/proveedores');

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
        console.error('âŒ Error en GET /api/proveedores:', error);
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
    console.error('ðŸ’¥ Error no manejado:', err);
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
    console.log('\nðŸš€ ====================================');
    console.log(`   Servidor corriendo en puerto ${PORT}`);
    console.log(`   Ambiente: ${process.env.NODE_ENV}`);
    console.log(`   URL: http://localhost:${PORT}`);
    console.log('   ====================================\n');
});
