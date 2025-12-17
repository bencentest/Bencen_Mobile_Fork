import { supabase, supabaseFinnegans } from './supabase';

export const api = {
    getItems: async (licitacionId) => {
        try {
            const { data, error } = await supabaseFinnegans
                .from('vista_plan_trabajo_final')
                .select('id, id_licitacion, orden, grupo, subgrupo, grupo_parent, subgrupo_parent, item, descripcion, unidad, cantidad')
                .eq('id_licitacion', licitacionId)
                .lt('orden', 9000)
                .order('orden', { ascending: true, nullsFirst: false })
                .order('id', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching items:', error);
            throw error;
        }
    },

    getItemHistory: async (itemId) => {
        try {
            // Fetch history with user details
            // We assume there is a foreign key relation between partes_diarios.user_id and mobile_users.id
            // If not, we might fail. But usually Supabase detects it if we named it user_id and both are in public.
            // Let's try explicit join or just fetch and then map if needed.

            // Checking database_setup.sql, we have user_id uuid references auth.users.
            // mobile_users is also references auth.users.
            // So we can join mobile_users on mobile_users.id = partes_diarios.user_id

            const { data, error } = await supabase
                .from('partes_diarios')
                .select(`
                    id,
                    avance,
                    fecha,
                    observaciones,
                    created_at,
                    mobile_users (
                        name,
                        email
                    )
                `)
                .eq('item_id', itemId)
                .order('fecha', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching history:', error);
            throw error;
        }
    },

    getActiveItemIds: async (licitacionId) => {
        try {
            // Fetch item_ids and their individual progress chunks
            const { data, error } = await supabase
                .from('partes_diarios')
                .select('item_id, avance')
                .eq('id_licitacion', licitacionId);

            if (error) throw error;

            // Aggregate progress by item_id
            const progressMap = new Map();

            data.forEach(row => {
                const current = progressMap.get(row.item_id) || 0;
                progressMap.set(row.item_id, current + row.avance);
            });

            return progressMap;
        } catch (error) {
            console.error('Error fetching active items:', error);
            return new Map();
        }
    },

    saveProgress: async (payload) => {
        // payload: { item_id, id_licitacion, avance, fecha, observaciones }
        const { item_id, id_licitacion, avance, fecha, observaciones } = payload;

        // Validate basics
        if (!item_id || avance === undefined) throw new Error("Faltan datos obligatorios");

        try {
            const { data, error } = await supabase
                .from('partes_diarios')
                .insert([{
                    item_id,
                    id_licitacion,
                    avance: parseFloat(avance),
                    fecha: fecha || new Date().toISOString().split('T')[0],
                    observaciones
                }])
                .select();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error saving progress:', error);
            throw error;
        }
    },

    updateProgress: async (id, payload) => {
        try {
            const { data, error } = await supabase
                .from('partes_diarios')
                .update({
                    avance: parseFloat(payload.avance),
                    observaciones: payload.observaciones,
                    fecha: payload.fecha
                })
                .eq('id', id)
                .select();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating progress:', error);
            throw error;
        }
    },

    deleteProgress: async (id) => {
        try {
            const { error } = await supabase
                .from('partes_diarios')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting progress:', error);
            throw error;
        }
    },

    getLicitaciones: async () => {
        try {
            // 1. Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return [];

            // 2. Get user role and permissions
            const { data: userData } = await supabase
                .from('mobile_users')
                .select('role')
                .eq('id', user.id)
                .single();

            const role = userData?.role;

            // 3. Base Query for Active Projects
            let query = supabase
                .from('datos_licitaciones')
                .select('id_licitacion, nombre_abreviado')
                .eq('obra_activa', true)
                .order('nombre_abreviado', { ascending: true });

            // 4. Apply filters based on role
            if (role === 'admin') {
                // Admins see all active projects
            } else {
                // Engineers see only assigned projects
                const { data: permissions } = await supabase
                    .from('mobile_permissions')
                    .select('licitacion_id')
                    .eq('user_id', user.id);

                const allowedIds = permissions?.map(p => p.licitacion_id) || [];

                if (allowedIds.length === 0) return []; // No access

                query = query.in('id_licitacion', allowedIds);
            }

            const { data, error } = await query;

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching licitaciones:', error);
            throw error;
        }
    }
};
