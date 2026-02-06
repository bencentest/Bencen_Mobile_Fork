import { supabase } from './supabase';

// During the migration, some environments still use the legacy `mobile_users` table.
// Prefer the new model: `reports_users.role_mobile -> usuarios_roles.id`.
const roleNameByIdCache = new Map();
const roleIdByNameCache = new Map();

async function getRoleNameById(roleId) {
    if (!roleId) return null;
    const key = String(roleId);
    if (roleNameByIdCache.has(key)) return roleNameByIdCache.get(key);

    const { data, error } = await supabase
        .from('usuarios_roles')
        .select('rol')
        .eq('id', roleId)
        .maybeSingle();

    if (error) throw error;
    const roleName = data?.rol ? String(data.rol).toLowerCase() : null;
    roleNameByIdCache.set(key, roleName);
    return roleName;
}

async function getRoleIdByName(roleName) {
    if (!roleName) return null;
    const key = String(roleName).toLowerCase();
    if (roleIdByNameCache.has(key)) return roleIdByNameCache.get(key);

    // If there are duplicates across applications, prefer the latest id (common in this DB).
    const { data, error } = await supabase
        .from('usuarios_roles')
        .select('id')
        .eq('rol', key)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    const id = data?.id ?? null;
    roleIdByNameCache.set(key, id);
    return id;
}

async function getCurrentMobileRole() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // New schema
    const { data: profile, error: profileError } = await supabase
        .from('reports_users')
        .select('role_mobile')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) throw profileError;

            if (profile?.role_mobile) {
        return await getRoleNameById(profile.role_mobile);
    }

    // Legacy fallback
    const { data: legacy, error: legacyError } = await supabase
        .from('mobile_users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    if (legacyError) throw legacyError;
    return legacy?.role ? String(legacy.role).toLowerCase() : null;
}

export const api = {
    getItems: async (licitacionId) => {
        try {
            const { data, error } = await supabase
                .from('datos_licitaciones_plan_trabajo')
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
            const { data, error } = await supabase
                .from('partes_diarios')
                .select(`
                    id,
                    avance,
                    fecha,
                    observaciones,
                    created_at,
                    photos,
                    fecha_inicio,
                    fecha_fin,
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

    checkDateOverlap: async (itemId, start, end, excludeId = null) => {
        if (!start || !end) return false;
        let query = supabase.from('partes_diarios')
            .select('id', { count: 'exact', head: true })
            .eq('item_id', itemId)
            // Overlap logic: (StartA <= EndB) and (EndA >= StartB)
            .lte('fecha_inicio', end)
            .gte('fecha_fin', start);

        if (excludeId) query = query.neq('id', excludeId);

        const { count, error } = await query;
        if (error) throw error;
        return count > 0;
    },

    uploadImage: async (file, folder = 'uploads') => {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${folder}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('report-evidence')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from('report-evidence')
                .getPublicUrl(filePath);

            return data.publicUrl;
        } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
        }
    },

    saveProgress: async (payload) => {
        const { item_id, id_licitacion, avance, fecha, observaciones, fecha_inicio, fecha_fin, photos } = payload;

        // Validate basics
        if (!item_id || avance === undefined) throw new Error("Faltan datos obligatorios");
        if (id_licitacion === null || id_licitacion === undefined) {
            throw new Error("Falta la obra (id_licitacion). Volvé a seleccionar la licitación e intentá de nuevo.");
        }

        // Permitir cualquier período (aunque se superponga con otros reportes).
        // Solo validamos coherencia básica: inicio <= fin.
        if (fecha_inicio && fecha_fin && fecha_inicio > fecha_fin) {
            throw new Error("La fecha de inicio no puede ser posterior al fin.");
        }

        try {
            const { data, error } = await supabase
                .from('partes_diarios')
                .insert([{
                    item_id,
                    id_licitacion,
                    avance: parseFloat(avance),
                    fecha: fecha || new Date().toISOString().split('T')[0],
                    observaciones,
                    fecha_inicio,
                    fecha_fin,
                    photos: photos || []
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
            // Permitir cualquier período (aunque se superponga con otros reportes).
            // Solo validamos coherencia básica: inicio <= fin.
            if (payload.fecha_inicio && payload.fecha_fin && payload.fecha_inicio > payload.fecha_fin) {
                throw new Error("La fecha de inicio no puede ser mayor al fin.");
            }

            const { data, error } = await supabase
                .from('partes_diarios')
                .update({
                    avance: parseFloat(payload.avance),
                    observaciones: payload.observaciones,
                    fecha: payload.fecha,
                    fecha_inicio: payload.fecha_inicio,
                    fecha_fin: payload.fecha_fin,
                    photos: payload.photos
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

            // 2. Get user role (new schema preferred)
            const role = await getCurrentMobileRole();

            // 3. Base Query for Active Projects
            let query = supabase
                .from('datos_licitaciones')
                .select('id_licitacion, nombre_abreviado')
                .eq('obra_activa', true)
                .order('nombre_abreviado', { ascending: true });

            // 4. Apply filters based on role
            if (role === 'admin' || role === 'admin_gerencia') {
                // Admins see all active projects
            } else {
                // Engineers see only assigned projects
                const { data: permissions } = await supabase
                    .from('reports_users_licitaciones')
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
    },

    // --- Role Management ---
    getRoles: async () => {
        try {
            const { data, error } = await supabase.from('roles').select('*').order('name');
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching roles:', error);
            return [];
        }
    },

    createRole: async (name, description) => {
        try {
            const { data, error } = await supabase.from('roles').insert([{ name, description }]).select();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating role:', error);
            throw error;
        }
    },

    // --- Admin Dashboard APIs ---


    getRecentActivity: async (limit = 20) => {
        try {
            // 1. Fetch recent parts with user info
            const { data: parts, error } = await supabase
                .from('partes_diarios')
                .select(`
                    id, avance, fecha, observaciones, created_at, item_id, id_licitacion,
                    mobile_users (name, email)
                `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            if (!parts || parts.length === 0) return [];

            // 2. Resolve Items (Public only)
            const itemIds = [...new Set(parts.map(p => p.item_id))];

            // Public Table (ID -> details)
            const { data: publicItems } = await supabase
                .from('datos_licitaciones_plan_trabajo')
                .select('id, item, descripcion, id_licitacion')
                .in('id', itemIds);

            // Build Maps
            const publicMap = new Map(publicItems?.map(i => [String(i.id), i]));

            // 3. Resolve Project Names
            // Get all unique Lic IDs from Parts + Items
            const allLicIds = new Set([
                ...parts.map(p => p.id_licitacion),
                ...publicItems?.map(i => i.id_licitacion) || [],
            ]);

            const { data: projects } = await supabase
                .from('datos_licitaciones')
                .select('id_licitacion, nombre_abreviado')
                .in('id_licitacion', [...allLicIds].filter(Boolean));

            const projectMap = new Map(projects?.map(p => [p.id_licitacion, p.nombre_abreviado]));

            return parts.map(p => {
                const sId = String(p.item_id);
                let desc = 'Item Desconocido';
                let code = '???';
                // Prefer Part's LicId, fallback to Item's
                let licId = p.id_licitacion;

                // Resolve Item Details
                const pub = publicMap.get(sId);
                if (pub) {
                    code = pub.item;
                    if (pub.descripcion) desc = pub.descripcion;
                    else if (code) desc = `Item ${code}`;
                    if (!licId) licId = pub.id_licitacion;
                }

                return {
                    ...p,
                    item_detail: { descripcion: desc, item: code },
                    project_name: projectMap.get(licId) || '---'
                };
            });
        } catch (error) {
            console.error('Error fetching recent activity:', error);
            return [];
        }
    },

    getDashboardMetrics: async (licitacionId = null) => {
        try {
            const todayISO = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';

            // Base queries
            let projectsQuery = supabase.from('datos_licitaciones').select('id_licitacion', { count: 'exact', head: true }).eq('obra_activa', true);
            let engineersQuery = (async () => {
                const engineerRoleId = await getRoleIdByName('engineer');
                if (engineerRoleId) {
                    return supabase.from('reports_users').select('id', { count: 'exact', head: true }).eq('role_mobile', engineerRoleId);
                }
                // Fallback legacy
                return supabase.from('mobile_users').select('id', { count: 'exact', head: true }).eq('role', 'engineer');
            })();
            let reportsQuery = supabase.from('partes_diarios').select('id', { count: 'exact', head: true }).gte('created_at', todayISO);

            // Apply filters
            if (licitacionId) {
                projectsQuery = projectsQuery.eq('id_licitacion', licitacionId);
                // For engineers, we check permissions (approximated by checking distinct users assigned)
                // Count assigned users in this licitacion (1 row per user due to unique constraint)
                engineersQuery = supabase.from('reports_users_licitaciones').select('user_id', { count: 'exact', head: true }).eq('licitacion_id', licitacionId);
                reportsQuery = reportsQuery.eq('id_licitacion', licitacionId);
            }

            // Execute
            const resolvedEngineersQuery = await engineersQuery;
            const [projectsRes, engineersRes, reportsRes] = await Promise.all([projectsQuery, resolvedEngineersQuery, reportsQuery]);

            // Calculate Items Metrics (Total / Completed)
            let totalItems = 0;
            let completedItems = 0;

            if (licitacionId) {
                // 1. Total Items
                const { count: tCount } = await supabase
                    .from('datos_licitaciones_plan_trabajo')
                    .select('id', { count: 'exact', head: true })
                    .eq('id_licitacion', licitacionId);
                totalItems = tCount || 0;

                // 2. Completed Items (Calculated from Advances)
                const { data: advances } = await supabase
                    .from('datos_licitaciones_avances')
                    .select('id_item, avance_real')
                    .eq('id_licitacion', licitacionId);

                if (advances) {
                    const progressMap = {};
                    advances.forEach(a => {
                        progressMap[a.id_item] = (progressMap[a.id_item] || 0) + (a.avance_real || 0);
                    });
                    completedItems = Object.values(progressMap).filter(p => p >= 0.99).length;
                }
            }

            return {
                activeProjects: projectsRes.count || 0,
                activeEngineers: engineersRes.count || 0,
                reportsToday: reportsRes.count || 0,
                totalItems: totalItems,
                completedItems: completedItems
            };
        } catch (error) {
            console.error('Error fetching metrics:', error);
            return { activeProjects: 0, activeEngineers: 0, reportsToday: 0, totalItems: 0, completedItems: 0 };
        }
    },

    getWeeklyActivity: async (licitacionId = null, startDate, endDate) => {
        try {
            // Defaults: Last 15 Days if not provided
            let start = startDate;
            let end = endDate;

            if (!start || !end) {
                const now = new Date();
                const past = new Date();
                past.setDate(now.getDate() - 15);
                start = past.toISOString().split('T')[0];
                end = now.toISOString().split('T')[0];
            }

            // 1. Fetch Parts in Range (Using FECHA_FIN as requested)
            let query = supabase
                .from('partes_diarios')
                .select(`
                    id, avance, fecha, fecha_fin, created_at, item_id, id_licitacion
                `)
                .gte('fecha', start)
                .lte('fecha', end)
                .order('fecha', { ascending: true });

            if (licitacionId) {
                query = query.eq('id_licitacion', licitacionId);
            }

            const { data: parts, error } = await query;

            if (error) throw error;
            if (!parts || parts.length === 0) return [];

            // Check User Role for Financial Data
            const role = await getCurrentMobileRole();
            const isAdmin = role === 'admin' || role === 'admin_gerencia';

            let itemToCostMap = new Map();

            if (isAdmin) {
                // 2. Fetch Cost Data (Hybrid Strategy)
                const itemIds = [...new Set(parts.map(p => p.item_id))];

                // A. Direct Match
                const { data: publicItems } = await supabase
                    .from('datos_licitaciones_plan_trabajo')
                    .select('id, item, pu_mod_mo, pu_mod_mat, pu_mod_eq, cantidad, id_licitacion')
                    .in('id', itemIds);

                publicItems?.forEach(i => {
                    const totalCost = (i.pu_mod_mo || 0) + (i.pu_mod_mat || 0) + (i.pu_mod_eq || 0);
                    itemToCostMap.set(String(i.id), { price: totalCost, qty: i.cantidad });
                });

                // Note: we no longer resolve missing item ids via Finnegans.
            }

            // 3. Aggregate by Date
            const grouped = {};
            parts.forEach(part => {
                const dateKey = part.fecha_fin || part.fecha;
                if (!grouped[dateKey]) grouped[dateKey] = { date: dateKey, parts: 0, money: 0 };

                grouped[dateKey].parts += 1;

                if (isAdmin) {
                    const costData = itemToCostMap.get(String(part.item_id));
                    if (costData) {
                        const executedMoney = (costData.price * costData.qty) * (part.avance / 100);
                        grouped[dateKey].money += executedMoney;
                    }
                }
            });

            return Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));

        } catch (error) {
            console.error('Error fetching weekly activity:', error);
            return [];
        }
    },

    getProjectFinancials: async (licitacionId) => {
        try {
            if (!licitacionId) return { totalScope: 0, totalExecuted: 0 };

            // 1. Check Admin
            const role = await getCurrentMobileRole();
            if (role !== 'admin' && role !== 'admin_gerencia') return { totalScope: 0, totalExecuted: 0 };

            // 2. Fetch Project Definition (Total Scope)
            const { data: projectItems, error: itemsErr } = await supabase
                .from('datos_licitaciones_plan_trabajo')
                .select('id, item, cantidad, pu_mod_mo, pu_mod_mat, pu_mod_eq')
                .eq('id_licitacion', licitacionId);

            if (itemsErr) throw itemsErr;

            let totalScope = 0;
            const costMapById = new Map();       // ID -> Cost
            const costMapByItemCode = new Map(); // Code -> Cost

            projectItems?.forEach(ex => {
                const unitPrice = (Number(ex.pu_mod_mo) || 0) + (Number(ex.pu_mod_mat) || 0) + (Number(ex.pu_mod_eq) || 0);
                const total = unitPrice * (Number(ex.cantidad) || 0);
                totalScope += total;

                costMapById.set(String(ex.id), ex);
                costMapByItemCode.set(ex.item, ex);
            });

            // 3. Fetch Execution (Parts)
            const { data: parts, error: partsErr } = await supabase
                .from('partes_diarios')
                .select('item_id, avance')
                .eq('id_licitacion', licitacionId);

            if (partsErr) throw partsErr;

            // 4. Calculate Total Executed
            let totalExecuted = 0;

            parts.forEach(part => {
                // Try Direct
                let cost = costMapById.get(String(part.item_id));

                if (cost) {
                    const unitPrice = (Number(cost.pu_mod_mo) || 0) + (Number(cost.pu_mod_mat) || 0) + (Number(cost.pu_mod_eq) || 0);
                    const totalItemScope = unitPrice * (Number(cost.cantidad) || 0);
                    const executedVal = totalItemScope * ((part.avance || 0) / 100);
                    totalExecuted += executedVal;
                }
            });

            return { totalScope, totalExecuted };
        } catch (e) {
            console.error("Error getting project financials:", e);
            return { totalScope: 0, totalExecuted: 0 };
        }
    },

    getProjectDetails: async (licitacionId) => {
        try {
            // 1. Fetch Plan Structure (All rows including Groups/Subgroups)
            const { data: plan, error: planError } = await supabase
                .from('datos_licitaciones_plan_trabajo')
                .select('id, id_licitacion, item, grupo, subgrupo, descripcion, unidad, cantidad, pu_mod_mo, pu_mod_mat, pu_mod_eq, orden')
                .eq('id_licitacion', licitacionId)
                .order('orden', { ascending: true }); // Crucial for structure

            if (planError) throw planError;

            // 2. Fetch Progress
            const { data: reports, error: reportsError } = await supabase
                .from('partes_diarios')
                .select('item_id, avance, fecha, created_at, id, observaciones, mobile_users(name)')
                .eq('id_licitacion', licitacionId)
                .order('created_at', { ascending: false });

            if (reportsError) throw reportsError;

            const progressMap = new Map();
            reports?.forEach(report => {
                const current = progressMap.get(String(report.item_id)) || 0;
                progressMap.set(String(report.item_id), current + (report.avance || 0));
            });

            // 3. Build Tree & Aggregate Data
            const groups = []; // Root groups
            const flatItems = []; // All items flat
            const nearCompletion = []; // 90-99%

            let currentGroup = null;
            let currentSubgroup = null;

            // Helper to calc money
            const getMoney = (item) => ((item.pu_mod_mo || 0) + (item.pu_mod_mat || 0) + (item.pu_mod_eq || 0)) * (item.cantidad || 0);

            plan.forEach(row => {
                // If GROUP header
                if (row.grupo) {
                    currentGroup = {
                        ...row,
                        totalMoney: 0,
                        executedMoney: 0,
                        itemCount: 0,
                        completedCount: 0,
                        subgroups: [],
                        directItems: []
                    };
                    groups.push(currentGroup);
                    currentSubgroup = null;
                }
                // If SUBGROUP header
                else if (row.subgrupo) {
                    currentSubgroup = {
                        ...row,
                        totalMoney: 0,
                        executedMoney: 0,
                        itemCount: 0,
                        completedCount: 0,
                        items: []
                    };
                    if (currentGroup) currentGroup.subgroups.push(currentSubgroup);
                }
                // Actual ITEM
                else {
                    const rawAvance = progressMap.get(String(row.id)) || 0;
                    const totalAvance = Math.min(rawAvance, 100);
                    const totalMoney = getMoney(row);
                    const executedMoney = totalMoney * (totalAvance / 100);

                    const processedItem = {
                        ...row,
                        avance: totalAvance,
                        weight: totalMoney,
                        rubro: currentGroup?.descripcion || 'General',
                        subrubro: currentSubgroup?.descripcion || ''
                    };

                    flatItems.push(processedItem);

                    if (totalAvance >= 90 && totalAvance < 100) nearCompletion.push(processedItem);

                    // Aggregate to Subgroup
                    if (currentSubgroup) {
                        currentSubgroup.totalMoney += totalMoney;
                        currentSubgroup.executedMoney += executedMoney;
                        currentSubgroup.itemCount += 1;
                        if (totalAvance >= 99.9) currentSubgroup.completedCount += 1;
                        currentSubgroup.items.push(processedItem);
                    }

                    // Aggregate to Group
                    if (currentGroup) {
                        currentGroup.totalMoney += totalMoney;
                        currentGroup.executedMoney += executedMoney;
                        currentGroup.itemCount += 1;
                        if (totalAvance >= 99.9) currentGroup.completedCount += 1;
                        // If no subgroup, add to directItems
                        if (!currentSubgroup) currentGroup.directItems.push(processedItem);
                    }
                }
            });

            // 4. Finalize Groups List for Charts (Top Groups)
            const groupList = groups.map(g => ({
                name: g.descripcion,
                totalMoney: g.totalMoney,
                executedMoney: g.executedMoney,
                progress: g.totalMoney > 0 ? (g.executedMoney / g.totalMoney) * 100 : 0,
                itemCount: g.itemCount,
                completedCount: g.completedCount
            })).sort((a, b) => b.progress - a.progress);

            // 5. Calculate Weekly Top Groups (Last 7 Days)
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const weekIso = oneWeekAgo.toISOString();

            const weeklyReports = reports?.filter(r => r.created_at >= weekIso) || [];
            const weeklyGroupMap = {};

            weeklyReports.forEach(r => {
                const item = flatItems.find(i => String(i.id) === String(r.item_id));
                if (item) {
                    // Calculate executed money contribution of this report
                    // Report Avance is raw %. 
                    // Contribution = (ReportAvance / 100) * ItemTotalMoney
                    const contribution = (item.weight || 0) * ((r.avance || 0) / 100);
                    const gName = item.rubro || 'General';
                    if (!weeklyGroupMap[gName]) weeklyGroupMap[gName] = 0;
                    weeklyGroupMap[gName] += contribution;
                }
            });

            const weeklyTopGroups = Object.keys(weeklyGroupMap).map(name => {
                const fullGroup = groupList.find(g => g.name === name);
                return {
                    name,
                    weeklyValue: weeklyGroupMap[name],
                    totalProgress: fullGroup ? fullGroup.progress : 0
                };
            }).sort((a, b) => b.weeklyValue - a.weeklyValue).slice(0, 4);

            // 6. Prepare Feed
            const feedWithNames = reports?.slice(0, 50).map(f => {
                const item = flatItems.find(p => String(p.id) === String(f.item_id));
                return {
                    ...f,
                    title: item ? `${item.rubro} - ${item.item}` : 'Item Desconocido',
                    description: item?.descripcion,
                    itemName: item?.item || 'Item desconocido',
                    rubro: item?.rubro || 'General'
                };
            });

            return {
                groups: groupList,
                weeklyTopGroups,
                items: flatItems,
                tree: groups,
                nearCompletion: nearCompletion,
                feed: feedWithNames || []
            };

        } catch (error) {
            console.error('Error in getProjectDetails:', error);
            return null;
        }
    },

    getAvanceEstimadoRealSeries: async ({
        licitacionId,
        itemIds,
        startDate = null,
        endDate = null,
        weightsByItemId = null,
        qtyByItemId = null,
        unitByItemId = null
    }) => {
        try {
            if (!licitacionId) return [];
            if (!Array.isArray(itemIds) || itemIds.length === 0) return [];

            const overlap = (p) => {
                if (!startDate || !endDate) return true;
                const desde = p.fecha_desde || p.fecha_hasta;
                const hasta = p.fecha_hasta || p.fecha_desde;
                if (!desde || !hasta) return true;
                return desde <= endDate && hasta >= startDate;
            };

            const { data: periods, error: periodsErr } = await supabase
                .from('datos_licitaciones_periodos')
                .select('id, orden, periodo, fecha_desde, fecha_hasta')
                .eq('id_licitacion', licitacionId)
                .order('orden', { ascending: true })
                .order('id', { ascending: true });

            if (periodsErr) throw periodsErr;
            const filteredPeriods = (periods || []).filter(overlap);
            const periodIds = filteredPeriods.map(p => p.id).filter(Boolean);
            if (periodIds.length === 0) return [];

            const weightFor = (itemId) => {
                if (!weightsByItemId) return 1;
                const key = String(itemId);
                const w = weightsByItemId[key] ?? weightsByItemId[itemId];
                const n = Number(w);
                return Number.isFinite(n) && n > 0 ? n : 1;
            };

            const qtyFor = (itemId) => {
                if (!qtyByItemId) return null;
                const key = String(itemId);
                const q = qtyByItemId[key] ?? qtyByItemId[itemId];
                const n = Number(q);
                return Number.isFinite(n) && n >= 0 ? n : null;
            };

            const unitFor = (itemId) => {
                if (!unitByItemId) return null;
                const key = String(itemId);
                const u = unitByItemId[key] ?? unitByItemId[itemId];
                return u ? String(u) : null;
            };

            // Quantity view is only valid if all items share the same unit and have quantity totals.
            let uniformUnit = null;
            let canQty = true;
            for (const id of itemIds) {
                const u = unitFor(id);
                const q = qtyFor(id);
                if (!u || q === null) { canQty = false; break; }
                if (!uniformUnit) uniformUnit = u;
                else if (uniformUnit !== u) { canQty = false; break; }
            }

            // Supabase `in()` can have practical limits; chunk item ids.
            const chunkSize = 500;
            const chunks = [];
            for (let i = 0; i < itemIds.length; i += chunkSize) chunks.push(itemIds.slice(i, i + chunkSize));

            let rows = [];
            for (const chunk of chunks) {
                const { data, error } = await supabase
                    .from('datos_licitaciones_avances')
                    .select('id_periodo, id_item, avance_real, avance_estimado')
                    .eq('id_licitacion', licitacionId)
                    .in('id_periodo', periodIds)
                    .in('id_item', chunk);

                if (error) throw error;
                rows = rows.concat(data || []);
            }

            const byPeriod = new Map();
            for (const pid of periodIds) {
                byPeriod.set(String(pid), {
                    realSum: 0,
                    estSum: 0,
                    weightSum: 0,
                    realQty: 0,
                    estQty: 0
                });
            }

            rows.forEach(r => {
                const pid = String(r.id_periodo);
                const bucket = byPeriod.get(pid);
                if (!bucket) return;

                const w = weightFor(r.id_item);
                bucket.realSum += (Number(r.avance_real) || 0) * w;
                bucket.estSum += (Number(r.avance_estimado) || 0) * w;
                bucket.weightSum += w;

                if (canQty) {
                    const qTotal = qtyFor(r.id_item);
                    if (qTotal !== null) {
                        bucket.realQty += (Number(r.avance_real) || 0) * qTotal;
                        bucket.estQty += (Number(r.avance_estimado) || 0) * qTotal;
                    }
                }
            });

            let cumReal = 0;
            let cumEst = 0;
            let cumRealQty = 0;
            let cumEstQty = 0;

            return filteredPeriods.map(p => {
                const bucket = byPeriod.get(String(p.id)) || { realSum: 0, estSum: 0, weightSum: 0 };
                const denom = bucket.weightSum > 0 ? bucket.weightSum : 1;
                const perReal = bucket.realSum / denom;
                const perEst = bucket.estSum / denom;

                cumReal += perReal;
                cumEst += perEst;
                if (canQty) {
                    cumRealQty += (bucket.realQty || 0);
                    cumEstQty += (bucket.estQty || 0);
                }

                const label = p.periodo || p.fecha_hasta || p.fecha_desde || String(p.orden ?? p.id);

                return {
                    id_periodo: p.id,
                    label,
                    real: Math.min(110, (cumReal * 100)),
                    estimado: Math.min(110, (cumEst * 100)),
                    real_qty: canQty ? cumRealQty : null,
                    estimado_qty: canQty ? cumEstQty : null,
                    unidad: canQty ? uniformUnit : null,
                    real_periodo: perReal * 100,
                    estimado_periodo: perEst * 100,
                    fecha_desde: p.fecha_desde,
                    fecha_hasta: p.fecha_hasta
                };
            });
        } catch (error) {
            console.error('Error in getAvanceEstimadoRealSeries:', error);
            throw error;
        }
    }
    ,

    getAvanceDefaultDateRange: async ({ licitacionId, itemIds }) => {
        try {
            if (!licitacionId) return null;
            if (!Array.isArray(itemIds) || itemIds.length === 0) return null;

            // Find min/max id_periodo that exists in avances for these items.
            // We do it with order+limit to avoid needing SQL aggregates.
            const chunkSize = 500;
            const chunks = [];
            for (let i = 0; i < itemIds.length; i += chunkSize) chunks.push(itemIds.slice(i, i + chunkSize));

            // Prefer the earliest period among all items
            let minRow = null;
            for (const chunk of chunks) {
                const { data, error } = await supabase
                    .from('datos_licitaciones_avances')
                    .select('id_periodo')
                    .eq('id_licitacion', licitacionId)
                    .in('id_item', chunk)
                    .order('id_periodo', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;
                if (data?.id_periodo !== null && data?.id_periodo !== undefined) {
                    if (!minRow || Number(data.id_periodo) < Number(minRow.id_periodo)) minRow = data;
                }
            }

            // Latest period among all items
            let maxRow = null;
            for (const chunk of chunks) {
                const { data, error } = await supabase
                    .from('datos_licitaciones_avances')
                    .select('id_periodo')
                    .eq('id_licitacion', licitacionId)
                    .in('id_item', chunk)
                    .order('id_periodo', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;
                if (data?.id_periodo !== null && data?.id_periodo !== undefined) {
                    if (!maxRow || Number(data.id_periodo) > Number(maxRow.id_periodo)) maxRow = data;
                }
            }

            const minPeriodId = minRow?.id_periodo ?? null;
            const maxPeriodId = maxRow?.id_periodo ?? null;
            if (!minPeriodId || !maxPeriodId) return null;

            const { data: periods, error: periodsErr } = await supabase
                .from('datos_licitaciones_periodos')
                .select('id, fecha_desde, fecha_hasta')
                .eq('id_licitacion', licitacionId)
                .in('id', [minPeriodId, maxPeriodId]);

            if (periodsErr) throw periodsErr;

            const pMin = (periods || []).find(p => String(p.id) === String(minPeriodId));
            const pMax = (periods || []).find(p => String(p.id) === String(maxPeriodId));

            const startDate = pMin?.fecha_desde || pMin?.fecha_hasta || null;
            const endDate = pMax?.fecha_hasta || pMax?.fecha_desde || null;

            if (!startDate || !endDate) return null;
            return { startDate, endDate };
        } catch (error) {
            console.error('Error in getAvanceDefaultDateRange:', error);
            return null;
        }
    }
    ,

    // For the item history chart: returns cumulative estimated % by arbitrary dates (ISO YYYY-MM-DD).
    // Estimado is read from datos_licitaciones_avances.avance_estimado per periodo.
    getItemEstimatedTimeline: async ({ licitacionId, itemId, dates }) => {
        try {
            if (!licitacionId || !itemId) return {};
            const dateList = (dates || []).filter(Boolean).map(d => String(d).slice(0, 10));
            if (dateList.length === 0) return {};

            const { data: periods, error: pErr } = await supabase
                .from('datos_licitaciones_periodos')
                .select('id, orden, fecha_desde, fecha_hasta')
                .eq('id_licitacion', licitacionId)
                .order('orden', { ascending: true })
                .order('id', { ascending: true });

            if (pErr) throw pErr;
            if (!periods || periods.length === 0) return {};

            const periodIds = periods.map(p => p.id).filter(Boolean);

            const { data: avances, error: aErr } = await supabase
                .from('datos_licitaciones_avances')
                .select('id_periodo, avance_estimado')
                .eq('id_licitacion', licitacionId)
                .eq('id_item', itemId)
                .in('id_periodo', periodIds);

            if (aErr) throw aErr;

            const estByPeriod = new Map((avances || []).map(a => [String(a.id_periodo), Number(a.avance_estimado) || 0]));

            // Build cumulative by ordered periods
            const cumByIndex = [];
            let running = 0;
            for (let i = 0; i < periods.length; i++) {
                const p = periods[i];
                running += estByPeriod.get(String(p.id)) || 0;
                cumByIndex[i] = running * 100; // to percent
            }

            const normPeriod = (p) => {
                const start = p.fecha_desde || p.fecha_hasta || null;
                const end = p.fecha_hasta || p.fecha_desde || null;
                return { start, end };
            };

            const pickCumForDate = (iso) => {
                // prefer period that CONTAINS the date; fallback to last period that ended before the date.
                let idxContain = -1;
                let idxLastEnded = -1;

                for (let i = 0; i < periods.length; i++) {
                    const { start, end } = normPeriod(periods[i]);
                    if (end && end <= iso) idxLastEnded = i;
                    if (start && end && start <= iso && iso <= end) idxContain = i;
                }

                const idx = idxContain !== -1 ? idxContain : idxLastEnded;
                if (idx === -1) return 0;
                return cumByIndex[idx] || 0;
            };

            const out = {};
            dateList.forEach(d => {
                out[String(d)] = pickCumForDate(String(d));
            });
            return out;
        } catch (error) {
            console.error('Error in getItemEstimatedTimeline:', error);
            return {};
        }
    }
    ,

    // Planned window for the selected items: first/last period where avance_estimado > 0.
    // Returns { startDate, endDate } from datos_licitaciones_periodos.
    getPlannedWindowByEstimado: async ({ licitacionId, itemIds }) => {
        try {
            if (!licitacionId) return null;
            if (!Array.isArray(itemIds) || itemIds.length === 0) return null;

            // Find min/max id_periodo among rows with estimado > 0.
            // Chunk itemIds to avoid `in()` limits.
            const chunkSize = 500;
            const chunks = [];
            for (let i = 0; i < itemIds.length; i += chunkSize) chunks.push(itemIds.slice(i, i + chunkSize));

            let minPid = null;
            for (const chunk of chunks) {
                const { data, error } = await supabase
                    .from('datos_licitaciones_avances')
                    .select('id_periodo')
                    .eq('id_licitacion', licitacionId)
                    .in('id_item', chunk)
                    .gt('avance_estimado', 0)
                    .order('id_periodo', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;
                if (data?.id_periodo !== null && data?.id_periodo !== undefined) {
                    if (minPid === null || Number(data.id_periodo) < Number(minPid)) minPid = data.id_periodo;
                }
            }

            let maxPid = null;
            for (const chunk of chunks) {
                const { data, error } = await supabase
                    .from('datos_licitaciones_avances')
                    .select('id_periodo')
                    .eq('id_licitacion', licitacionId)
                    .in('id_item', chunk)
                    .gt('avance_estimado', 0)
                    .order('id_periodo', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;
                if (data?.id_periodo !== null && data?.id_periodo !== undefined) {
                    if (maxPid === null || Number(data.id_periodo) > Number(maxPid)) maxPid = data.id_periodo;
                }
            }

            if (minPid === null || maxPid === null) return null;

            const { data: periods, error: pErr } = await supabase
                .from('datos_licitaciones_periodos')
                .select('id, fecha_desde, fecha_hasta')
                .eq('id_licitacion', licitacionId)
                .in('id', [minPid, maxPid]);

            if (pErr) throw pErr;
            const pMin = (periods || []).find(p => String(p.id) === String(minPid));
            const pMax = (periods || []).find(p => String(p.id) === String(maxPid));

            const startDate = pMin?.fecha_desde || pMin?.fecha_hasta || null;
            const endDate = pMax?.fecha_hasta || pMax?.fecha_desde || null;
            if (!startDate || !endDate) return null;

            return { startDate, endDate };
        } catch (error) {
            console.error('Error in getPlannedWindowByEstimado:', error);
            return null;
        }
    }
};
