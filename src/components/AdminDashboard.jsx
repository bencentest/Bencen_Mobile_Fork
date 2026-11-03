import React, { useEffect, useRef, useState } from 'react';
import { supabase, supabaseMobile } from '../services/supabase';
import { Users, Shield, Plus, X, Loader2, LogOut, Search, CheckCircle2, Bell, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { NotificationFeed } from './admin/NotificationFeed';
import { PortfolioHome } from './admin/PortfolioHome';
import { ProjectDetailDashboard } from './admin/ProjectDetailDashboard';

function getAdminStorageKey(userId, suffix) {
    return `bencen_${userId}_${suffix}`;
}

export function AdminDashboard({ onLogout, currentRole, currentUserId }) {
    const [showUserList, setShowUserList] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showUsersMenu, setShowUsersMenu] = useState(false);
    const [refreshTrigger] = useState(0); // For forcing updates
    const usersMenuRef = useRef(null);

    // Open obra detail (persisted per user so a reload keeps the user where they were)
    const projectStorageKey = currentUserId ? getAdminStorageKey(currentUserId, 'admin_project') : null;
    const detailedStorageKey = currentUserId ? getAdminStorageKey(currentUserId, 'admin_showDetailed') : null;

    const [selectedProject, setSelectedProject] = useState(() => {
        if (!projectStorageKey) return '';
        try {
            return localStorage.getItem(projectStorageKey) || '';
        } catch {
            return '';
        }
    });
    const [showDetailed, setShowDetailed] = useState(() => {
        if (!detailedStorageKey) return false;
        try {
            return localStorage.getItem(detailedStorageKey) === 'true';
        } catch {
            return false;
        }
    });

    useEffect(() => {
        if (!projectStorageKey) return;
        try {
            localStorage.setItem(projectStorageKey, selectedProject);
        } catch {
            void 0;
        }
    }, [projectStorageKey, selectedProject]);

    useEffect(() => {
        if (!detailedStorageKey) return;
        try {
            localStorage.setItem(detailedStorageKey, String(showDetailed));
        } catch {
            void 0;
        }
    }, [detailedStorageKey, showDetailed]);

    useEffect(() => {
        if (!showUsersMenu) return;
        const close = (e) => {
            if (usersMenuRef.current && !usersMenuRef.current.contains(e.target)) setShowUsersMenu(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [showUsersMenu]);

    const openProject = (projectId) => {
        setSelectedProject(String(projectId));
        setShowDetailed(true);
    };

    const handleDetailBack = () => setShowDetailed(false);

    // Render Detailed Dashboard View
    if (showDetailed && selectedProject) {
        return (
            <ProjectDetailDashboard
                key={selectedProject}
                projectId={selectedProject}
                currentRole={currentRole}
                onBack={handleDetailBack}
            />
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-neutral-900">
            {/* Navbar */}
            <div className="bg-neutral-900 text-white px-4 md:px-6 py-3 sticky top-0 z-20 shadow-md">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center shrink-0">
                            <Shield className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <span className="font-bold text-lg tracking-tight truncate block leading-tight">Avance de obras</span>
                            <span className="text-[11px] text-neutral-400 hidden sm:block">
                                {currentRole === 'admin_gerencia' ? 'Gerencia' : 'Administrador'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Feed: dropdown only where the side column is hidden */}
                        <div className="relative lg:hidden">
                            <button
                                onClick={() => setShowNotifications(!showNotifications)}
                                className={`p-2 rounded-full transition-colors ${showNotifications ? 'bg-neutral-700 text-white' : 'hover:bg-neutral-800 text-neutral-400'}`}
                                title="Actividad reciente"
                            >
                                <Bell className="w-5 h-5" />
                            </button>
                            {showNotifications && (
                                <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-sm bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50 text-neutral-900">
                                    <div className="h-[70vh]">
                                        <NotificationFeed refreshTrigger={refreshTrigger} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative" ref={usersMenuRef}>
                            <button
                                onClick={() => setShowUsersMenu(v => !v)}
                                className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-sm font-medium transition-colors ${showUsersMenu ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'}`}
                            >
                                <Users className="w-4 h-4" />
                                <span className="hidden sm:inline">Usuarios</span>
                                <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            {showUsersMenu && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50 text-neutral-900 py-1">
                                    <button
                                        onClick={() => { setShowUsersMenu(false); setShowUserList(true); }}
                                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                                    >
                                        <Users className="w-4 h-4 text-blue-600" />
                                        Gestionar usuarios
                                    </button>
                                </div>
                            )}
                        </div>

                        <button onClick={onLogout} className="p-2 bg-neutral-800 rounded-full hover:bg-neutral-700 transition-colors" title="Salir">
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main: portfolio + live feed */}
            <div className="flex-1 w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
                <PortfolioHome
                    currentUserId={currentUserId}
                    refreshTrigger={refreshTrigger}
                    onOpenProject={openProject}
                />
                <div className="hidden lg:block sticky top-24 h-[calc(100vh-7.5rem)]">
                    <NotificationFeed refreshTrigger={refreshTrigger} />
                </div>
            </div>

            {/* Modals */}
            {showUserList && <UserListModal onClose={() => setShowUserList(false)} currentRole={currentRole} />}
        </div>
    );
}

// --- MODALS ---

function UserListModal({ onClose, currentRole }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [availableRoles, setAvailableRoles] = useState([]);
    const [visibilitySavingId, setVisibilitySavingId] = useState(null);
    const [supportsManageVisibility, setSupportsManageVisibility] = useState(true);

    const isGerencia = currentRole === 'admin_gerencia';

    useEffect(() => {
        fetchUsers();
        supabase
            .from('Usuarios_Roles')
            .select('id, rol')
            .eq('Aplicacion', 'Mobile')
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
            .from('Usuarios_Auth')
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
                .from('Usuarios_Auth')
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

    const toggleManageVisibility = async (u) => {
        if (!u?.id) return;
        if (!supportsManageVisibility) {
            alert("Falta la columna Usuarios_Auth.mobile_manage_visible en la base.");
            return;
        }

        const next = !(u.mobile_manage_visible === true);
        setVisibilitySavingId(String(u.id));
        try {
            const { error } = await supabase.rpc('avance_fisico_set_visible', {
                p_usuario_id: u.id,
                p_visible: next
            });
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[min(78vh,680px)] sm:h-[600px] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-600" /> Gestión de Usuarios
                    </h3>
                    <button onClick={onClose}><X className="w-6 h-6 text-neutral-400 hover:text-neutral-800" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-white">
                    <p className="mb-3 text-xs text-neutral-500">
                        Acá se asignan las obras de cada persona. Dar, cambiar o quitar el acceso a la app se hace en Portal → Accesos.
                    </p>
                    {loading ? <Loader2 className="animate-spin mx-auto mt-10" /> : (
                        <div className="grid gap-3">
                            {users.map(u => (
                                <div key={u.id} className="p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="font-bold text-neutral-900 break-words">{u.name}</p>
                                        <p className="text-sm text-neutral-500 break-all">{u.email}</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-2 shrink-0 sm:ml-4">
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
                                                            className={`h-9 w-full sm:w-9 rounded-lg border transition-colors flex items-center justify-center disabled:opacity-60 ${u.mobile_manage_visible === false
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
                                                        className={`h-9 w-full sm:w-[120px] rounded-lg text-xs font-bold border shadow-sm transition-colors ${canEditPerms
                                                            ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                                                            : 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed'
                                                            }`}
                                                    >
                                                        Permisos
                                                    </button>

                                                    {/* El rol se asigna en Portal → Accesos (role_mobile, compartido con Solicitudes). */}
                                                    <span
                                                        className="h-9 w-full sm:w-[120px] text-xs font-bold uppercase px-3 rounded-lg border border-gray-200 text-neutral-600 bg-gray-50 flex items-center justify-center"
                                                        title="El rol se cambia en Portal → Accesos"
                                                    >
                                                        {roleName || 'sin rol'}
                                                    </span>
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
            const { data: allProjects } = await supabase.from('Datos_Licitaciones').select('id_licitacion, nombre_abreviado').eq('obra_activa', true).not('obra_finalizada', 'is', true).order('nombre_abreviado');
            const { data: perms } = await supabaseMobile.from('reports_users_licitaciones').select('licitacion_id').eq('user_id', user.id);
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
            const { error } = await supabase.rpc('avance_fisico_set_obra', {
                p_usuario_id: user.id,
                p_licitacion_id: Number(licitacionId),
                p_habilitado: newSet.has(key)
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
