import { supabase } from './supabase';

const VALID_MOBILE_ROLES = new Set(['admin', 'admin_gerencia', 'engineer', 'sobrestante']);

async function getRoleName(roleId) {
    if (!roleId) return null;

    const { data, error } = await supabase
        .from('Usuarios_Roles')
        .select('rol')
        .eq('id', roleId)
        .maybeSingle();

    if (error) throw error;
    return data?.rol ? String(data.rol).toLowerCase() : null;
}

export async function getMobileAccessState(userId) {
    if (!userId) {
        return { status: 'unauthorized', userName: null, role: null };
    }

    const { data: profile, error: profileError } = await supabase
        .from('Usuarios_Auth')
        .select('name, role_mobile')
        .eq('id', userId)
        .maybeSingle();

    if (profileError) throw profileError;

    if (!profile) {
        return { status: 'unauthorized', userName: null, role: null };
    }

    if (!profile.role_mobile) {
        return {
            status: 'pending',
            userName: profile.name || null,
            role: null
        };
    }

    const roleName = await getRoleName(profile.role_mobile);
    if (!roleName || !VALID_MOBILE_ROLES.has(roleName)) {
        return {
            status: 'unauthorized',
            userName: profile.name || null,
            role: roleName
        };
    }

    return {
        status: 'authorized',
        userName: profile.name || null,
        role: roleName
    };
}
