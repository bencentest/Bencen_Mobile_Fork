import { supabase, supabaseMobile } from './supabase';

// Mobile roles/users live in `Usuarios_Auth`.
// `Usuarios_Auth.role_mobile -> Usuarios_Roles.id`.
const roleNameByIdCache = new Map();

async function getRoleNameById(roleId) {
    if (!roleId) return null;
    const key = String(roleId);
    if (roleNameByIdCache.has(key)) return roleNameByIdCache.get(key);

    const { data, error } = await supabase
        .from('Usuarios_Roles')
        .select('rol')
        .eq('id', roleId)
        .maybeSingle();

    if (error) throw error;
    const roleName = data?.rol ? String(data.rol).toLowerCase() : null;
    roleNameByIdCache.set(key, roleName);
    return roleName;
}

async function getCurrentMobileRole() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile, error: profileError } = await supabase
        .from('Usuarios_Auth')
        .select('role_mobile')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) throw profileError;

    if (profile?.role_mobile) {
        return await getRoleNameById(profile.role_mobile);
    }
    return null;
}

async function attachReporterProfiles(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) return list;

    const userIds = [...new Set(list.map((row) => row?.user_id).filter(Boolean))];
    if (userIds.length === 0) {
        return list.map((row) => ({ ...row, reporter: null }));
    }

    const { data, error } = await supabase
        .from('Usuarios_Auth')
        .select('id, name, email')
        .in('id', userIds);

    if (error) throw error;

    const reporterById = new Map((data || []).map((user) => [String(user.id), user]));
    return list.map((row) => ({
        ...row,
        reporter: reporterById.get(String(row.user_id)) || null
    }));
}

export const api = {
    getItems: async (licitacionId) => {
        try {
            const { data, error } = await supabase
                .from('Datos_Licitaciones_Plan_Trabajo')
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
            const { data, error } = await supabaseMobile
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
                    user_id
                `)
                .eq('item_id', itemId)
                .order('fecha', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            return await attachReporterProfiles(data || []);
        } catch (error) {
            console.error('Error fetching history:', error);
            throw error;
        }
    },

    getActiveItemIds: async (licitacionId) => {
        try {
            // Fetch item_ids and their individual progress chunks
            const { data, error } = await supabaseMobile
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
        let query = supabaseMobile.from('partes_diarios')
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
            const { data, error } = await supabaseMobile
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

            const { data, error } = await supabaseMobile
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
            const { data, error } = await supabaseMobile
                .from('partes_diarios')
                .delete()
                .eq('id', id)
                .select('id');

            if (error) throw error;
            return Array.isArray(data) ? data.length : 0;
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
                .from('Datos_Licitaciones')
                .select('id_licitacion, nombre_abreviado')
                .eq('obra_activa', true)
                .not('obra_finalizada', 'is', true) // vigentes: activas y no finalizadas (null cuenta como no finalizada)
                .order('nombre_abreviado', { ascending: true });

            // 4. Apply filters based on role
            if (role === 'admin' || role === 'admin_gerencia') {
                // Admins see all active projects
            } else {
                // Engineers see only assigned projects
                const { data: permissions, error: permissionsError } = await supabaseMobile
                    .from('reports_users_licitaciones')
                    .select('licitacion_id')
                    .eq('user_id', user.id);

                if (permissionsError) throw permissionsError;

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

    // --- Admin Dashboard APIs ---

    // Portfolio home: one summary per active obra.
    // - Real: sum(partes_diarios.avance) per item, capped at 100.
    // - Plan a hoy: sum(Datos_Licitaciones_Avances.avance_estimado) (fraction per period) for elapsed periods;
    //   the current period counts proportionally to elapsed days.
    // Both are returned weighted by cost (PU x cantidad) and by item count.
    getPortfolioOverview: async () => {
        try {
            const projects = await api.getLicitaciones();
            if (!projects || projects.length === 0) return { projects: [], generatedAt: new Date().toISOString() };

            const licIds = projects.map(p => p.id_licitacion);
            const pageSize = 1000;
            const fetchAll = async (buildQuery) => {
                const rows = [];
                for (let from = 0; ; from += pageSize) {
                    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
                    if (error) throw error;
                    rows.push(...(data || []));
                    if (!data || data.length < pageSize) return rows;
                }
            };

            const [planRows, parts, periods, estRows] = await Promise.all([
                fetchAll(() => supabase
                    .from('Datos_Licitaciones_Plan_Trabajo')
                    .select('id, id_licitacion, grupo, subgrupo, cantidad, pu_mod_mo, pu_mod_mat, pu_mod_eq')
                    .in('id_licitacion', licIds)
                    .order('id', { ascending: true })),
                fetchAll(() => supabaseMobile
                    .from('partes_diarios')
                    .select('id, item_id, id_licitacion, avance, created_at, user_id')
                    .in('id_licitacion', licIds)
                    .order('id', { ascending: true })),
                fetchAll(() => supabase
                    .from('Datos_Licitaciones_Periodos')
                    .select('id, id_licitacion, fecha_desde, fecha_hasta')
                    .in('id_licitacion', licIds)
                    .order('id', { ascending: true })),
                fetchAll(() => supabase
                    .from('Datos_Licitaciones_Avances')
                    .select('id_licitacion, id_item, id_periodo, avance_estimado')
                    .in('id_licitacion', licIds)
                    .gt('avance_estimado', 0)
                    .order('id_item', { ascending: true })
                    .order('id_periodo', { ascending: true }))
            ]);

            const dayMs = 24 * 60 * 60 * 1000;
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const parseDay = (iso) => {
                const s = String(iso || '').slice(0, 10);
                if (!s) return null;
                const [y, m, d] = s.split('-').map(Number);
                return new Date(y, m - 1, d).getTime();
            };

            // Elapsed fraction per period (0..1) and plan window bounds.
            const periodInfo = new Map();
            periods.forEach(p => {
                const start = parseDay(p.fecha_desde || p.fecha_hasta);
                const end = parseDay(p.fecha_hasta || p.fecha_desde);
                if (start === null || end === null) return;
                let elapsed = 0;
                if (todayStart >= end) elapsed = 1;
                else if (todayStart >= start) elapsed = (todayStart - start + dayMs) / (end - start + dayMs);
                periodInfo.set(String(p.id), { start, end, elapsed });
            });

            const items = new Map(); // itemId -> { licId, cost, real, plan }
            planRows.forEach(r => {
                if (r.grupo || r.subgrupo) return;
                const unitPrice = (Number(r.pu_mod_mo) || 0) + (Number(r.pu_mod_mat) || 0) + (Number(r.pu_mod_eq) || 0);
                items.set(String(r.id), { licId: r.id_licitacion, cost: unitPrice * (Number(r.cantidad) || 0), real: 0, plan: 0 });
            });

            const planWindow = new Map(); // licId -> { start, end }
            estRows.forEach(r => {
                const item = items.get(String(r.id_item));
                const period = periodInfo.get(String(r.id_periodo));
                if (!item || !period) return;
                item.plan += (Number(r.avance_estimado) || 0) * 100 * period.elapsed;
                const w = planWindow.get(r.id_licitacion) || { start: period.start, end: period.end };
                w.start = Math.min(w.start, period.start);
                w.end = Math.max(w.end, period.end);
                planWindow.set(r.id_licitacion, w);
            });

            const activityDays = 14;
            const firstActivityDay = todayStart - (activityDays - 1) * dayMs;
            const reportStats = new Map(); // licId -> { last, count7d, activity[] }
            const statsFor = (licId) => {
                if (!reportStats.has(licId)) reportStats.set(licId, { last: null, count7d: 0, activity: Array(activityDays).fill(0) });
                return reportStats.get(licId);
            };

            parts.forEach(p => {
                const item = items.get(String(p.item_id));
                if (item) item.real += Number(p.avance) || 0;

                const stats = statsFor(p.id_licitacion || item?.licId);
                const created = p.created_at ? new Date(p.created_at) : null;
                if (!created || Number.isNaN(created.getTime())) return;
                if (!stats.last || created > new Date(stats.last.created_at)) stats.last = p;
                const createdDay = new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime();
                const idx = Math.round((createdDay - firstActivityDay) / dayMs);
                if (idx >= 0 && idx < activityDays) {
                    stats.activity[idx] += 1;
                    if (idx >= activityDays - 7) stats.count7d += 1;
                }
            });

            const lastReports = await attachReporterProfiles([...reportStats.values()].map(s => s.last).filter(Boolean));
            const reporterByPartId = new Map(lastReports.map(r => [String(r.id), r.reporter]));

            const summaries = projects.map(project => {
                const licId = project.id_licitacion;
                const projectItems = [...items.values()].filter(i => i.licId === licId);
                const totalCost = projectItems.reduce((sum, i) => sum + i.cost, 0);

                const weighted = (weightOf) => {
                    const totalWeight = projectItems.reduce((sum, i) => sum + weightOf(i), 0);
                    if (totalWeight <= 0) return { real: 0, plan: 0 };
                    const avg = (key) => projectItems.reduce((sum, i) => sum + weightOf(i) * Math.min(100, i[key]), 0) / totalWeight;
                    return { real: avg('real'), plan: avg('plan') };
                };

                const stats = reportStats.get(licId) || { last: null, count7d: 0, activity: Array(activityDays).fill(0) };
                const planWin = planWindow.get(licId) || null;

                return {
                    id_licitacion: licId,
                    nombre_abreviado: project.nombre_abreviado,
                    itemCount: projectItems.length,
                    hasCosts: totalCost > 0,
                    hasPlan: Boolean(planWin),
                    byCost: weighted(i => i.cost),
                    byItems: weighted(() => 1),
                    planStart: planWin ? new Date(planWin.start).toISOString().slice(0, 10) : null,
                    planEnd: planWin ? new Date(planWin.end).toISOString().slice(0, 10) : null,
                    lastReportAt: stats.last?.created_at || null,
                    lastReporter: stats.last ? (reporterByPartId.get(String(stats.last.id)) || null) : null,
                    reports7d: stats.count7d,
                    activity: stats.activity
                };
            });

            return { projects: summaries, generatedAt: now.toISOString() };
        } catch (error) {
            console.error('Error fetching portfolio overview:', error);
            throw error;
        }
    },


    getRecentActivity: async (limit = 20) => {
        try {
            const { data: rawParts, error } = await supabaseMobile
                .from('partes_diarios')
                .select(`
                    id, avance, fecha, observaciones, created_at, item_id, id_licitacion, user_id
                `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            const parts = await attachReporterProfiles(rawParts || []);
            if (!parts || parts.length === 0) return [];

            // 2. Resolve Items (Public only)
            const itemIds = [...new Set(parts.map(p => p.item_id))];

            // Public Table (ID -> details)
            const { data: publicItems } = await supabase
                .from('Datos_Licitaciones_Plan_Trabajo')
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
                .from('Datos_Licitaciones')
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

    getProjectDetails: async (licitacionId) => {
        try {
            // 1. Fetch Plan Structure (All rows including Groups/Subgroups)
            const { data: plan, error: planError } = await supabase
                .from('Datos_Licitaciones_Plan_Trabajo')
                .select('id, id_licitacion, item, grupo, subgrupo, descripcion, unidad, cantidad, pu_mod_mo, pu_mod_mat, pu_mod_eq, orden')
                .eq('id_licitacion', licitacionId)
                .order('orden', { ascending: true }); // Crucial for structure

            if (planError) throw planError;

            // 2. Fetch Progress
            const { data: rawReports, error: reportsError } = await supabaseMobile
                .from('partes_diarios')
                .select('item_id, avance, fecha, created_at, id, observaciones, user_id')
                .eq('id_licitacion', licitacionId)
                .order('created_at', { ascending: false });

            if (reportsError) throw reportsError;
            const reports = await attachReporterProfiles(rawReports || []);

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
                .from('Datos_Licitaciones_Periodos')
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
                    .from('Datos_Licitaciones_Avances')
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
                    .from('Datos_Licitaciones_Avances')
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
                    .from('Datos_Licitaciones_Avances')
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
                .from('Datos_Licitaciones_Periodos')
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
    // Estimado is read from Datos_Licitaciones_Avances.avance_estimado per periodo.
    getItemEstimatedTimeline: async ({ licitacionId, itemId, dates }) => {
        try {
            if (!licitacionId || !itemId) return {};
            const dateList = (dates || []).filter(Boolean).map(d => String(d).slice(0, 10));
            if (dateList.length === 0) return {};

            const { data: periods, error: pErr } = await supabase
                .from('Datos_Licitaciones_Periodos')
                .select('id, orden, fecha_desde, fecha_hasta')
                .eq('id_licitacion', licitacionId)
                .order('orden', { ascending: true })
                .order('id', { ascending: true });

            if (pErr) throw pErr;
            if (!periods || periods.length === 0) return {};

            const periodIds = periods.map(p => p.id).filter(Boolean);

            const { data: avances, error: aErr } = await supabase
                .from('Datos_Licitaciones_Avances')
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

            // Full timeline of period end dates
            const fullTimeline = periods.map((p, i) => ({
                date: p.fecha_hasta || p.fecha_desde,
                cumulative: cumByIndex[i]
            })).filter(pt => pt.date);

            return { byDate: out, fullTimeline };
        } catch (error) {
            console.error('Error in getItemEstimatedTimeline:', error);
            return { byDate: {}, fullTimeline: [] };
        }
    }
    ,

    // Planned window for the selected items: first/last period where avance_estimado > 0.
    // Returns { startDate, endDate } from Datos_Licitaciones_Periodos.
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
                    .from('Datos_Licitaciones_Avances')
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
                    .from('Datos_Licitaciones_Avances')
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
                .from('Datos_Licitaciones_Periodos')
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
    },

    // Monthly plan (estimado) vs real (partes_diarios) per item.
    // - Columns are months derived from Datos_Licitaciones_Periodos (grouped by YYYY-MM based on fecha_hasta/fecha_desde).
    // - Real is aggregated from partes_diarios by month using fecha_fin (or fecha fallback). (Option 1: assign the whole carga to its end month.)
    // Returns: { months: [{ key, label, start, end }], estByItemId: { [id]: { [monthKey]: pctPoints } }, realByItemId: { [id]: { [monthKey]: pctPoints } } }
    getMonthlyPlanVsReal: async ({ licitacionId, itemIds }) => {
        try {
            if (!licitacionId) return { months: [], estByItemId: {}, realByItemId: {} };
            if (!Array.isArray(itemIds) || itemIds.length === 0) return { months: [], estByItemId: {}, realByItemId: {} };

            const toIso = (v) => String(v || '').slice(0, 10) || null;
            const monthKeyOfIso = (iso) => {
                const s = String(iso || '');
                return s.length >= 7 ? s.slice(0, 7) : null; // YYYY-MM
            };

            const { data: periods, error: pErr } = await supabase
                .from('Datos_Licitaciones_Periodos')
                .select('id, orden, periodo, fecha_desde, fecha_hasta')
                .eq('id_licitacion', licitacionId)
                .order('orden', { ascending: true })
                .order('id', { ascending: true });

            if (pErr) throw pErr;

            const periodList = periods || [];
            const monthsMap = new Map(); // key -> { key,label,start,end, periodIds: [] }
            const periodMonthKey = new Map(); // periodId -> monthKey

            periodList.forEach((p) => {
                const startIso = toIso(p.fecha_desde || p.fecha_hasta);
                const endIso = toIso(p.fecha_hasta || p.fecha_desde);
                const key = monthKeyOfIso(endIso || startIso);
                if (!key) return;

                periodMonthKey.set(String(p.id), key);

                if (!monthsMap.has(key)) {
                    const label = (() => {
                        const [y, m] = key.split('-');
                        return `${m}/${String(y).slice(2)}`;
                    })();
                    monthsMap.set(key, { key, label, start: startIso, end: endIso, periodIds: [p.id] });
                } else {
                    const bucket = monthsMap.get(key);
                    bucket.periodIds.push(p.id);
                    if (bucket.start && startIso && startIso < bucket.start) bucket.start = startIso;
                    if (bucket.end && endIso && endIso > bucket.end) bucket.end = endIso;
                }
            });

            const months = Array.from(monthsMap.values()).sort((a, b) => a.key.localeCompare(b.key));

            const estByItemId = {};
            const realByItemId = {};
            itemIds.forEach((id) => {
                const k = String(id);
                estByItemId[k] = {};
                realByItemId[k] = {};
            });

            const periodIds = periodList.map(p => p.id).filter(Boolean);
            if (periodIds.length === 0) return { months, estByItemId, realByItemId };

            // --- Estimado: sum avance_estimado per item per month (as percent points) ---
            const chunkSize = 500;
            const chunks = [];
            for (let i = 0; i < itemIds.length; i += chunkSize) chunks.push(itemIds.slice(i, i + chunkSize));

            for (const chunk of chunks) {
                const { data: avances, error: aErr } = await supabase
                    .from('Datos_Licitaciones_Avances')
                    .select('id_item, id_periodo, avance_estimado')
                    .eq('id_licitacion', licitacionId)
                    .in('id_item', chunk)
                    .in('id_periodo', periodIds);

                if (aErr) throw aErr;
                (avances || []).forEach((r) => {
                    const itemId = String(r.id_item);
                    const monthKey = periodMonthKey.get(String(r.id_periodo)) || null;
                    if (!monthKey) return;
                    const deltaPctPoints = (Number(r.avance_estimado) || 0) * 100;
                    estByItemId[itemId][monthKey] = (Number(estByItemId[itemId][monthKey]) || 0) + deltaPctPoints;
                });
            }

            // --- Real: sum partes_diarios.avance per item per month (by fecha_fin or fecha) ---
            for (const chunk of chunks) {
                const { data: parts, error: rErr } = await supabaseMobile
                    .from('partes_diarios')
                    .select('id, item_id, avance, fecha, fecha_fin')
                    .eq('id_licitacion', licitacionId)
                    .in('item_id', chunk);

                if (rErr) throw rErr;
                (parts || []).forEach((p) => {
                    const iso = toIso(p.fecha_fin || p.fecha);
                    const key = monthKeyOfIso(iso);
                    if (!key) return;
                    const itemId = String(p.item_id);
                    realByItemId[itemId][key] = (Number(realByItemId[itemId][key]) || 0) + (Number(p.avance) || 0);
                });
            }

            return { months, estByItemId, realByItemId };
        } catch (error) {
            console.error('Error in getMonthlyPlanVsReal:', error);
            throw error;
        }
    },

    // Timeline of progress "cargas" (partes_diarios) for one or more items.
    // Returns one point per carga (sorted by fecha_fin/fecha then created_at),
    // including cumulative "real" both in % (weighted by weightsByItemId) and in quantity when possible.
    getAvanceCargasTimeline: async ({
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

            const totalWeight = itemIds.reduce((sum, id) => sum + weightFor(id), 0) || 1;

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

            const chunkSize = 500;
            const chunks = [];
            for (let i = 0; i < itemIds.length; i += chunkSize) chunks.push(itemIds.slice(i, i + chunkSize));

            let rows = [];
            for (const chunk of chunks) {
                let q = supabaseMobile
                    .from('partes_diarios')
                    .select('id, item_id, avance, fecha, fecha_inicio, fecha_fin, created_at, observaciones')
                    .eq('id_licitacion', licitacionId)
                    .in('item_id', chunk);

                // Try to filter on the effective "fecha de avance" (fecha_fin OR fecha).
                // Supabase doesn't support coalesce in the query builder, so we OR both columns.
                if (startDate && endDate) {
                    q = q.or(`and(fecha_fin.gte.${startDate},fecha_fin.lte.${endDate}),and(fecha.gte.${startDate},fecha.lte.${endDate})`);
                } else if (startDate) {
                    q = q.or(`fecha_fin.gte.${startDate},fecha.gte.${startDate}`);
                } else if (endDate) {
                    q = q.or(`fecha_fin.lte.${endDate},fecha.lte.${endDate}`);
                }

                const { data, error } = await q;
                if (error) throw error;
                rows = rows.concat(data || []);
            }

            const effectiveIso = (r) => String(r?.fecha_fin || r?.fecha || '').slice(0, 10) || null;
            const inRange = (iso) => {
                if (!iso) return false;
                if (startDate && iso < startDate) return false;
                if (endDate && iso > endDate) return false;
                return true;
            };

            const normalized = (rows || [])
                .map(r => {
                    const iso = effectiveIso(r);
                    return {
                        ...r,
                        _avance_iso: iso
                    };
                })
                .filter(r => inRange(r._avance_iso));

            // Sort by "fecha de avance" then by created_at so cumulative is consistent.
            normalized.sort((a, b) => {
                const da = a._avance_iso || '';
                const db = b._avance_iso || '';
                if (da !== db) return da < db ? -1 : 1;
                const ca = a.created_at || '';
                const cb = b.created_at || '';
                if (ca !== cb) return ca < cb ? -1 : 1;
                return Number(a.id) - Number(b.id);
            });

            let cumPct = 0;
            let cumQty = 0;

            return normalized.map((r) => {
                const itemId = r.item_id;
                const avance = Number(r.avance) || 0;
                const iso = r._avance_iso;

                const w = weightFor(itemId);
                const deltaPct = (avance * w / totalWeight);
                cumPct += deltaPct;

                let deltaQty = null;
                if (canQty) {
                    const qTotal = qtyFor(itemId);
                    if (qTotal !== null) {
                        deltaQty = (avance / 100) * qTotal;
                        cumQty += deltaQty;
                    }
                }

                return {
                    id: r.id,
                    item_id: r.item_id,
                    observaciones: r.observaciones ?? null,
                    created_at: r.created_at ?? null,
                    fecha_inicio: r.fecha_inicio ?? null,
                    fecha_fin: r.fecha_fin ?? null,
                    fecha: r.fecha ?? null,
                    avance,
                    avance_iso: iso,
                    real_delta_pct: deltaPct,
                    real_cum_pct: cumPct,
                    real_delta_qty: canQty ? deltaQty : null,
                    real_cum_qty: canQty ? cumQty : null,
                    unidad: canQty ? uniformUnit : null
                };
            });
        } catch (error) {
            console.error('Error in getAvanceCargasTimeline:', error);
            throw error;
        }
    }
};
