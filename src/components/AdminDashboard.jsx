import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { Users, Shield, Plus, X, Loader2, LogOut, Search, UserPlus, CheckCircle2, Bell, BarChart2, Settings, Eye, EyeOff } from 'lucide-react';
import { AdminMetrics } from './admin/AdminMetrics';
import { NotificationFeed } from './admin/NotificationFeed';
import { ProjectDetailDashboard } from './admin/ProjectDetailDashboard';

export function AdminDashboard({ onLogout, currentRole }) {
    const [showUserList, setShowUserList] = useState(false);
    const [showCreateUser, setShowCreateUser] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0); // For forcing updates
    // Project Filtering
    const [projects, setProjects] = useState([]);

    // Persistence: Initialize from localStorage
    const [selectedProject, setSelectedProject] = useState(() => localStorage.getItem('bencen_admin_project') || '');
    const [showDetailed, setShowDetailed] = useState(() => localStorage.getItem('bencen_admin_showDetailed') === 'true');

    // Persistence: Save to localStorage
    useEffect(() => {
        localStorage.setItem('bencen_admin_project', selectedProject);
    }, [selectedProject]);

    useEffect(() => {
        localStorage.setItem('bencen_admin_showDetailed', String(showDetailed));
    }, [showDetailed]);

    useEffect(() => {
        // Load projects for filter
        api.getLicitaciones().then(data => {
            setProjects(data);
            if (data && data.length > 0) {
                // Validate if stored selection exists in list
                const storedId = localStorage.getItem('bencen_admin_project');
                const isValid = data.some(p => p.id_licitacion === storedId);

                if (!isValid) {
                    setSelectedProject(data[0].id_licitacion);
                }
            }
        });
    }, []);

    const handleDetailBack = () => setShowDetailed(false);

    // Render Detailed Dashboard View
    if (showDetailed && selectedProject) {
        return (
            <ProjectDetailDashboard
                projectId={selectedProject}
                onBack={handleDetailBack}
            />
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-neutral-900">
            {/* Navbar */}
            <div className="bg-neutral-900 text-white px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                    </div>
                    <span className="font-bold text-lg tracking-tight">Admin Dashboard</span>
                </div>

                {/* Global Filter */}
                <div className="hidden md:flex items-center gap-3 bg-neutral-800 rounded-lg px-3 py-1.5 border border-neutral-700">
                    <Search className="w-4 h-4 text-neutral-400" />
                    <select
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        className="bg-transparent text-sm text-white font-medium focus:outline-none min-w-[200px]"
                    >
                        {projects.map(p => (
                            <option key={p.id_licitacion} value={p.id_licitacion} className="text-black">
                                {p.nombre_abreviado}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-4">
                    {/* Notification Bell */}
                    <div className="relative">
                        <button
                            onClick={() => setShowNotifications(!showNotifications)}
                            className={`p-2 rounded-full transition-colors ${showNotifications ? 'bg-neutral-700 text-white' : 'hover:bg-neutral-800 text-neutral-400'}`}
                        >
                            <Bell className="w-5 h-5" />
                            {/* Red Dot if needed */}
                            <span className="absolute top-2 right-2 w-2 h-2 bg-orange-500 rounded-full border border-neutral-900"></span>
                        </button>

                        {/* Notification Dropdown */}
                        {showNotifications && (
                            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                                <div className="h-[500px]">
                                    <NotificationFeed refreshTrigger={refreshTrigger} />
                                </div>
                            </div>
                        )}
                    </div>

                    <span className="text-sm text-neutral-400 hidden sm:inline">Administrador</span>
                    <button onClick={onLogout} className="p-2 bg-neutral-800 rounded-full hover:bg-neutral-700 transition-colors">
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Main Content Area - Full Width */}
            <div className="flex-1 p-4 md:p-6 w-full mx-auto space-y-6">

                {/* Action Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ActionCard
                        icon={Users}
                        title="Gestionar Usuarios"
                        desc="Ver lista, roles y permisos"
                        onClick={() => setShowUserList(true)}
                        color="bg-blue-600"
                    />
                    <ActionCard
                        icon={UserPlus}
                        title="Alta de Usuario"
                        desc="Asignar rol a nuevos usuarios"
                        onClick={() => setShowCreateUser(true)}
                        color="bg-purple-600"
                    />
                </div>

                <div className="pt-2 pb-1 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-neutral-800 flex items-center gap-2">
                        {selectedProject
                            ? (
                                <>
                                    Dashboard de <span className="text-orange-600">{projects.find(p => String(p.id_licitacion) === String(selectedProject))?.nombre_abreviado || 'Obra'}</span>
                                </>
                            )
                            : "Dashboard Global"
                        }
                    </h2>
                </div>

                {/* Dashboard Metrics - Filtered */}
                <AdminMetrics projectId={selectedProject} refreshTrigger={refreshTrigger} />

                {/* Detailed Metrics Button */}
                {selectedProject && (
                    <button
                        onClick={() => setShowDetailed(true)}
                        className="w-full py-3 bg-neutral-900 text-white font-bold rounded-xl shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 mt-6 active:scale-[0.98]"
                    >
                        <BarChart2 className="w-5 h-5 text-orange-400" />
                        Ver Métricas Detalladas
                    </button>
                )}
            </div>

            {/* Modals */}
            {showUserList && <UserListModal onClose={() => setShowUserList(false)} currentRole={currentRole} />}
            {showCreateUser && (
                <CreateUserModal
                    onClose={() => setShowCreateUser(false)}
                    onSuccess={() => setRefreshTrigger(x => x + 1)}
                    currentRole={currentRole}
                />
            )}
        </div>
    );
}

function ActionCard({ icon: Icon, title, desc, onClick, color }) {
    return (
        <button
            onClick={onClick}
            className="p-3 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-orange-200 hover:shadow-md transition-all text-left flex items-center gap-3 group"
        >
            <div className={`w-10 h-10 rounded-lg ${color} text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <h3 className="font-bold text-neutral-800 text-base leading-tight">{title}</h3>
                <p className="text-xs text-neutral-500">{desc}</p>
            </div>
        </button>
    )
}

// --- MODALS ---

function CreateUserModal({ onClose, onSuccess, currentRole }) {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);

    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedRoleId, setSelectedRoleId] = useState('');
    const [supportsApproval, setSupportsApproval] = useState(true);
    const [showGerenciaSettings, setShowGerenciaSettings] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [gerenciaShowAllPending, setGerenciaShowAllPending] = useState(false);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const isGerencia = currentRole === 'admin_gerencia';

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const fetchUsers = async () => {
                    // Prefer to include approval flag, but keep backwards-compat if the column doesn't exist yet.
                    const res = await supabase
                        .from('reports_users')
                        .select('id, email, name, role_mobile, mobile_admin_visible')
                        .order('name', { ascending: true, nullsFirst: false });

                    if (!res.error) return { ...res, supportsApproval: true };

                    const msg = String(res.error?.message || '');
                    if (msg.toLowerCase().includes('mobile_admin_visible')) {
                        const fallback = await supabase
                            .from('reports_users')
                            .select('id, email, name, role_mobile')
                            .order('name', { ascending: true, nullsFirst: false });
                        return { ...fallback, supportsApproval: false };
                    }

                    return { ...res, supportsApproval: true };
                };

                const [uRes, rRes] = await Promise.all([
                    fetchUsers(),
                    supabase
                        .from('usuarios_roles')
                        .select('id, rol')
                        .in('rol', ['admin', 'admin_gerencia', 'engineer', 'sobrestante'])
                        .order('id', { ascending: true }),
                ]);

                const u = uRes.data;
                const uErr = uRes.error;
                const r = rRes.data;
                const rErr = rRes.error;

                if (uErr) throw uErr;
                if (rErr) throw rErr;

                if (cancelled) return;
                setUsers(u || []);
                setRoles(r || []);
                setSupportsApproval(Boolean(uRes.supportsApproval));

                const pending = (u || []).filter(x => !x.role_mobile);
                const approvalEnabled = Boolean(uRes.supportsApproval);
                const candidates = (() => {
                    if (!approvalEnabled) return pending;
                    if (isGerencia) {
                        if (gerenciaShowAllPending) return pending;
                        return pending.filter(x => x.mobile_admin_visible === true);
                    }
                    return pending.filter(x => x.mobile_admin_visible === true);
                })();

                // Only set default selection if:
                // - nothing selected yet, OR
                // - selected user is no longer pending, OR
                // - selected user isn't in the currently visible candidates list
                const selectedIsPending = pending.some(x => String(x.id) === String(selectedUserId));
                const selectedIsCandidate = candidates.some(x => String(x.id) === String(selectedUserId));
                if (!selectedUserId || !selectedIsPending || !selectedIsCandidate) {
                    setSelectedUserId(candidates[0]?.id ? String(candidates[0].id) : '');
                }

                const engineer = (r || []).find(x => String(x.rol).toLowerCase() === 'engineer');
                if ((!selectedRoleId || selectedRoleId === '') && engineer) setSelectedRoleId(String(engineer.id));
            } catch (e) {
                console.error(e);
                if (!cancelled) setError(e?.message || 'Error cargando datos.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    // Alta: mostrar solo usuarios nuevos (sin rol asignado)
    const pendingUsers = users.filter(u => !u.role_mobile);
    const visibleUsers = (() => {
        // Para que Gerencia pueda corroborar el efecto del checkbox, por defecto mostramos
        // la misma "vista admin": solo los habilitados.
        if (isGerencia) {
            if (!supportsApproval) return pendingUsers;
            if (gerenciaShowAllPending) return pendingUsers;
            return pendingUsers.filter(u => u.mobile_admin_visible === true);
        }
        if (!supportsApproval) return pendingUsers; // fallback until DB column exists
        return pendingUsers.filter(u => u.mobile_admin_visible === true);
    })();

    const selectedUser = users.find(u => String(u.id) === String(selectedUserId)) || null;
    const selectedUserLabel = selectedUser ? (selectedUser.name || selectedUser.email || selectedUser.id) : '';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (!selectedUserId) {
            setError('Selecciona un usuario.');
            return;
        }
        if (!visibleUsers.some(u => String(u.id) === String(selectedUserId))) {
            setError('El usuario seleccionado ya no estÃ¡ disponible en esta lista. VolvÃ© a seleccionarlo.');
            return;
        }
        if (!selectedRoleId) {
            setError('Selecciona un rol.');
            return;
        }

        setSaving(true);
        try {
            const { error: upErr } = await supabase
                .from('reports_users')
                // Ensure it shows up in Admin "Gestion de Usuarios" list even if it was previously hidden.
                .update({ role_mobile: Number(selectedRoleId), mobile_manage_visible: true })
                .eq('id', selectedUserId);

            if (upErr) throw upErr;

            if (onSuccess) onSuccess();
            alert('Usuario habilitado correctamente.');
            onClose();
        } catch (e) {
            console.error(e);
            setError(e?.message || 'Error al habilitar usuario.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl text-neutral-900">Alta de Usuario</h3>
                    <div className="flex items-center gap-2">
                        {isGerencia && (
                            <button
                                type="button"
                                onClick={() => setShowGerenciaSettings(true)}
                                className="p-2 rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                                title="Ajustes (admin_gerencia)"
                            >
                                <Settings className="w-5 h-5" />
                            </button>
                        )}
                        <button onClick={onClose}><X className="w-6 h-6 text-neutral-400 hover:text-neutral-800" /></button>
                    </div>
                </div>

                {loading ? (
                    <div className="py-10 flex justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-gray-700">Usuario</label>
                                {isGerencia && supportsApproval && (
                                    <button
                                        type="button"
                                        onClick={() => setGerenciaShowAllPending(v => !v)}
                                        className="text-xs font-bold text-neutral-500 hover:text-orange-600"
                                        title="Cambiar vista"
                                    >
                                        {gerenciaShowAllPending ? 'Vista admin' : 'Ver todos'}
                                    </button>
                                )}
                            </div>
                            <select
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                                title={selectedUserLabel}
                                className="w-full h-12 px-3 rounded-xl border border-gray-300 bg-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none transition-all text-[13px]"
                                required
                            >
                                <option value="" disabled>Selecciona un usuario...</option>
                                {visibleUsers.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.name || u.email || '(Sin nombre)'}
                                    </option>
                                ))}
                            </select>

                            {visibleUsers.length === 0 && (
                                <p className="text-xs text-neutral-400 mt-2">
                                    {isGerencia
                                        ? 'No hay usuarios pendientes en reports_users.'
                                        : (supportsApproval
                                            ? 'No hay usuarios habilitados por Gerencia para asignar rol.'
                                            : 'No hay usuarios pendientes en reports_users. (Falta configurar aprobaciones de Gerencia)')}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Rol (Mobile)</label>
                            <select
                                value={selectedRoleId}
                                onChange={(e) => setSelectedRoleId(e.target.value)}
                                className="w-full h-12 px-3 rounded-xl border border-gray-300 bg-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none transition-all text-sm capitalize"
                                required
                            >
                                <option value="" disabled>Selecciona un rol...</option>
                                {roles.map(r => (
                                    <option key={r.id} value={r.id}>
                                        {r.rol}
                                    </option>
                                ))}
                            </select>
                            {isGerencia && supportsApproval && (
                                <p className="text-[11px] text-neutral-400 mt-2">
                                    Tip: usÃ¡ la ruedita para habilitar/ocultar usuarios en el alta.
                                </p>
                            )}
                        </div>

                        {error && (
                            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-100">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={saving || visibleUsers.length === 0}
                            className="w-full h-12 bg-neutral-900 text-white font-bold rounded-xl hover:bg-black transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Habilitar Usuario'}
                        </button>
                    </form>
                )}
            </div>

            {showGerenciaSettings && (
                <AdminGerenciaSettingsModal
                    onClose={() => setShowGerenciaSettings(false)}
                    onUpdated={() => {
                        setReloadKey(x => x + 1);
                        if (onSuccess) onSuccess();
                    }}
                    onVisibilityChange={(userId, visible) => {
                        setUsers(prev => prev.map(u => String(u.id) === String(userId) ? { ...u, mobile_admin_visible: Boolean(visible) } : u));
                    }}
                />
            )}
        </div>
    );
}

function AdminGerenciaSettingsModal({ onClose, onUpdated, onVisibilityChange }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pending, setPending] = useState([]);
    const [savingId, setSavingId] = useState(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await supabase
                    .from('reports_users')
                    .select('id, email, name, role_mobile, mobile_admin_visible')
                    .order('name', { ascending: true, nullsFirst: false });

                if (res.error) throw res.error;

                if (cancelled) return;
                setPending((res.data || []).filter(u => !u.role_mobile));
            } catch (e) {
                console.error(e);
                const msg = String(e?.message || 'Error cargando usuarios.');
                setError(msg);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, []);

    const setApproved = async (userId, approved) => {
        setSavingId(String(userId));
        try {
            const { error: upErr } = await supabase
                .from('reports_users')
                .update({ mobile_admin_visible: Boolean(approved) })
                .eq('id', userId);

            if (upErr) throw upErr;

            setPending(prev => prev.map(u => String(u.id) === String(userId) ? { ...u, mobile_admin_visible: Boolean(approved) } : u));
            if (onVisibilityChange) onVisibilityChange(userId, approved);
            if (onUpdated) onUpdated();
        } catch (e) {
            console.error(e);
            alert('Error: ' + (e?.message || 'No se pudo actualizar.'));
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="font-bold text-neutral-900">Ajustes de Gerencia</h3>
                        <p className="text-xs text-neutral-500">ElegÃ­ quÃ© usuarios aparecen en el alta de Admin.</p>
                    </div>
                    <button onClick={onClose}><X className="w-6 h-6 text-neutral-400 hover:text-neutral-800" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-white space-y-2">
                    {loading ? (
                        <div className="py-10 flex justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-100">
                            {error}
                            <div className="text-xs text-red-600 mt-2">
                            Falta la columna `reports_users.mobile_admin_visible`.
                            </div>
                        </div>
                    ) : pending.length === 0 ? (
                        <div className="text-sm text-neutral-500">No hay usuarios pendientes.</div>
                    ) : (
                        pending.map(u => (
                            <div key={u.id} className="p-3 rounded-xl border border-gray-200 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-bold text-sm text-neutral-900 truncate">{u.name || '(Sin nombre)'}</div>
                                    <div className="text-xs text-neutral-500 truncate">{u.email}</div>
                                </div>

                                <label className="flex items-center gap-2 shrink-0 text-xs font-bold text-neutral-700">
                                    <input
                                        type="checkbox"
                                        checked={u.mobile_admin_visible === true}
                                        disabled={savingId === String(u.id)}
                                        onChange={(e) => setApproved(u.id, e.target.checked)}
                                        className="w-4 h-4 accent-orange-600"
                                    />
                                    Habilitar
                                </label>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
function UserListModal({ onClose, currentRole }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [availableRoles, setAvailableRoles] = useState([]);
    const [removingUserId, setRemovingUserId] = useState(null);
    const [visibilitySavingId, setVisibilitySavingId] = useState(null);
    const [supportsManageVisibility, setSupportsManageVisibility] = useState(true);

    const isGerencia = currentRole === 'admin_gerencia';

    useEffect(() => {
        fetchUsers();
        supabase
            .from('usuarios_roles')
            .select('id, rol')
            .in('rol', ['admin', 'admin_gerencia', 'engineer', 'sobrestante'])
            .order('id', { ascending: true })
            .then(({ data, error }) => {
                if (error) throw error;
                setAvailableRoles(data || []);
            })
            .catch(err => console.error(err));
    }, []);

    const fetchUsers = async () => {
        const primary = await supabase
            .from('reports_users')
            .select('id, email, name, role_mobile, mobile_manage_visible')
            .not('role_mobile', 'is', null) // Gestion: solo usuarios activos (con rol asignado)
            .order('name', { ascending: true, nullsFirst: false });

        if (!primary.error) {
            const rows = primary.data || [];
            // Admin: solo ve los que Gerencia dejo visibles. Gerencia: ve todos.
            setUsers(isGerencia ? rows : rows.filter(u => u.mobile_manage_visible !== false));
            setSupportsManageVisibility(true);
            setLoading(false);
            return;
        }

        const msg = String(primary.error?.message || '');
        if (msg.toLowerCase().includes('mobile_manage_visible')) {
            const fallback = await supabase
                .from('reports_users')
                .select('id, email, name, role_mobile')
                .not('role_mobile', 'is', null)
                .order('name', { ascending: true, nullsFirst: false });
            setUsers(fallback.data || []);
            setSupportsManageVisibility(false);
            setLoading(false);
            return;
        }

        console.error(primary.error);
        setUsers([]);
        setLoading(false);
    };

    // ... inside UserListModal component ...
    const changeRole = async (userId, newRoleId) => {
        // Confirmation is optional but safe
        // if (!window.confirm(`¿Cambiar rol a ${newRole}?`)) return;

        try {
            const { error } = await supabase
                .from('reports_users')
                .update({ role_mobile: Number(newRoleId) })
                .eq('id', userId);

            if (error) throw error;

            setUsers(users.map(u => u.id === userId ? { ...u, role_mobile: Number(newRoleId) } : u));
        } catch (err) {
            console.error(err);
            alert("Error al actualizar rol: " + err.message);
        }
    };

    const removeMobileAssignments = async (u) => {
        if (!u?.id) return;
        const label = u.name || u.email || 'este usuario';
        if (!window.confirm(`¿Quitar rol y permisos de obras a ${label}?`)) return;

        setRemovingUserId(String(u.id));
        try {
            const { error: delErr } = await supabase
                .from('reports_users_licitaciones')
                .delete()
                .eq('user_id', u.id);
            if (delErr) throw delErr;

            const { error: updErr } = await supabase
                .from('reports_users')
                .update({ role_mobile: null, mobile_admin_visible: false })
                .eq('id', u.id);
            if (updErr) throw updErr;

            if (selectedUser?.id === u.id) setSelectedUser(null);
            await fetchUsers();
        } catch (err) {
            console.error(err);
            alert("Error al quitar asignaciones: " + (err?.message || 'Error'));
        } finally {
            setRemovingUserId(null);
        }
    };

    const toggleManageVisibility = async (u) => {
        if (!u?.id) return;
        if (!supportsManageVisibility) {
            alert("Falta la columna reports_users.mobile_manage_visible en la base.");
            return;
        }

        const next = !(u.mobile_manage_visible === true);
        setVisibilitySavingId(String(u.id));
        try {
            const { error } = await supabase
                .from('reports_users')
                .update({ mobile_manage_visible: next })
                .eq('id', u.id);
            if (error) throw error;

            // Gerencia ve todos (solo cambia el icono). Admin ve filtrado.
            setUsers(prev => {
                const updated = prev.map(x => String(x.id) === String(u.id) ? { ...x, mobile_manage_visible: next } : x);
                return isGerencia ? updated : updated.filter(x => x.mobile_manage_visible !== false);
            });
        } catch (err) {
            console.error(err);
            alert("Error: " + (err?.message || 'No se pudo actualizar visibilidad.'));
        } finally {
            setVisibilitySavingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-600" /> Gestión de Usuarios
                    </h3>
                    <button onClick={onClose}><X className="w-6 h-6 text-neutral-400 hover:text-neutral-800" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-white">
                    {loading ? <Loader2 className="animate-spin mx-auto mt-10" /> : (
                        <div className="grid gap-3">
                            {users.map(u => (
                                <div key={u.id} className="p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-neutral-900">{u.name}</p>
                                        <p className="text-sm text-neutral-500">{u.email}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-4">
                                        {(() => {
                                            const roleName = String(availableRoles.find(r => String(r.id) === String(u.role_mobile))?.rol || '').toLowerCase();
                                            const canEditPerms = roleName !== 'admin' && roleName !== 'admin_gerencia';

                                            return (
                                                <>
                                                    {/* Solo Gerencia puede ocultar usuarios de la lista de Admin */}
                                                    {isGerencia && (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleManageVisibility(u)}
                                                            disabled={visibilitySavingId === String(u.id)}
                                                            className={`h-9 w-9 rounded-lg border transition-colors flex items-center justify-center disabled:opacity-60 ${u.mobile_manage_visible === false
                                                                ? 'border-gray-200 text-gray-400 bg-gray-50 hover:bg-gray-100'
                                                                : 'border-neutral-200 text-neutral-700 bg-white hover:bg-neutral-50'
                                                                }`}
                                                            title={u.mobile_manage_visible === false ? 'Oculto para Admin' : 'Visible para Admin'}
                                                            aria-label="Visibilidad en lista de admin"
                                                        >
                                                            {visibilitySavingId === String(u.id)
                                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                                : (u.mobile_manage_visible === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />)}
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => canEditPerms && setSelectedUser(u)}
                                                        disabled={!canEditPerms}
                                                        className={`h-9 w-[120px] rounded-lg text-xs font-bold border shadow-sm transition-colors ${canEditPerms
                                                            ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                                                            : 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed'
                                                            }`}
                                                    >
                                                        Permisos
                                                    </button>

                                                    {/* Role Selector */}
                                                    <select
                                                        value={u.role_mobile ? String(u.role_mobile) : ''}
                                                        onChange={(e) => changeRole(u.id, e.target.value)}
                                                        className="h-9 w-[120px] text-xs font-bold uppercase px-3 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 outline-none cursor-pointer appearance-none text-center"
                                                        aria-label="Rol Mobile"
                                                    >
                                                        <option value="" disabled>SIN ROL</option>
                                                        {availableRoles.map(r => (
                                                            <option key={r.id} value={r.id}>{r.rol}</option>
                                                        ))}
                                                    </select>

                                                    {isGerencia && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeMobileAssignments(u)}
                                                            disabled={removingUserId === String(u.id)}
                                                            className="h-9 w-9 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center disabled:opacity-60"
                                                            title="Quitar rol y permisos (volver a pendientes)"
                                                            aria-label="Quitar asignaciones"
                                                        >
                                                            {removingUserId === String(u.id)
                                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                                : <X className="w-4 h-4" />}
                                                        </button>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {selectedUser && <PermissionsModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
        </div>
    );
}

function PermissionsModal({ user, onClose }) {
    const [projects, setProjects] = useState([]);
    const [userPermissions, setUserPermissions] = useState(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const { data: allProjects } = await supabase.from('datos_licitaciones').select('id_licitacion, nombre_abreviado').eq('obra_activa', true).order('nombre_abreviado');
            const { data: perms } = await supabase.from('reports_users_licitaciones').select('licitacion_id').eq('user_id', user.id);
            setProjects(allProjects || []);
            // Normalize to string to avoid Set.has mismatches (number vs string ids)
            setUserPermissions(new Set((perms || []).map(p => String(p.licitacion_id))));
            setLoading(false);
        } catch (err) { console.error(err); setLoading(false); }
    };

    const toggle = async (licitacionId) => {
        const key = String(licitacionId);
        const newSet = new Set(userPermissions);
        if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
        setUserPermissions(newSet);
        try {
            const { error } = await supabase.rpc('toggle_permission', {
                target_user_id: user.id,
                target_licitacion_id: licitacionId
            });
            if (error) throw error;
        } catch (err) {
            console.error(err);
            alert("Error: " + (err?.message || 'No se pudo actualizar el permiso.'));
            loadData();
        }
    };

    const sortedProjects = [...projects].sort((a, b) => {
        const aAllowed = userPermissions.has(String(a.id_licitacion));
        const bAllowed = userPermissions.has(String(b.id_licitacion));
        if (aAllowed !== bAllowed) return aAllowed ? -1 : 1; // asignadas primero
        return String(a.nombre_abreviado || '').localeCompare(String(b.nombre_abreviado || ''), 'es', { sensitivity: 'base' });
    });

    return (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-white/50 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-sm overflow-hidden flex flex-col max-h-[500px]">
                <div className="p-3 border-b flex justify-between items-center bg-gray-50">
                    <div><h4 className="font-bold text-sm">Permisos: {user.name}</h4></div>
                    <button onClick={onClose}><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {loading ? <Loader2 className="animate-spin mx-auto" /> : sortedProjects.map(p => {
                        const allowed = userPermissions.has(String(p.id_licitacion));
                        return (
                            <button
                                key={p.id_licitacion}
                                onClick={() => toggle(p.id_licitacion)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex justify-between items-center border ${allowed ? 'bg-green-50 text-green-800 border-green-300' : 'bg-white hover:bg-gray-50 text-gray-600 border-transparent'}`}
                            >
                                {p.nombre_abreviado}
                                {allowed && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
