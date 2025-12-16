import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { Users, Plus, Shield, Check, X, Loader2, LogOut } from 'lucide-react';

export function AdminDashboard({ onLogout }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserName, setNewUserName] = useState('');
    const [addingUser, setAddingUser] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const { data, error } = await supabase
                .from('mobile_users')
                .select('*')
                .order('role', { ascending: true }) // admins first usually alphabetically 'admin' < 'engineer'
                .order('name', { ascending: true }); // Order by name now

            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        if (!newUserEmail || !newUserPassword || !newUserName) {
            alert("Todos los datos son obligatorios");
            return;
        }
        setAddingUser(true);
        try {
            // Using the new RPC that creates the user in Auth + Helper table
            const { data, error } = await supabase.rpc('create_user_via_admin', {
                _email: newUserEmail,
                _password: newUserPassword,
                _name: newUserName
            });

            if (error) throw error;

            // RPC returns text, check for specific error messages or success
            if (data?.startsWith('Error:')) {
                alert(data);
            } else {
                alert("Usuario creado correctamente!");
                setNewUserEmail('');
                setNewUserPassword('');
                setNewUserName('');
                fetchUsers();
            }
        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
        } finally {
            setAddingUser(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-neutral-900 text-white p-4 flex justify-between items-center sticky top-0 z-10 shadow-md">
                <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-orange-500" />
                    <span className="font-bold text-lg">Panel de Administrador</span>
                </div>
                <button onClick={onLogout} className="p-2 bg-neutral-800 rounded-full hover:bg-neutral-700">
                    <LogOut className="w-4 h-4" />
                </button>
            </div>

            <div className="p-4 flex-1 max-w-2xl w-full mx-auto space-y-6">

                {/* Add User */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-neutral-800 mb-3 text-sm uppercase tracking-wide">Dar de alta Ingeniero</h3>
                    <form onSubmit={handleAddUser} className="flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                value={newUserName}
                                onChange={e => setNewUserName(e.target.value)}
                                placeholder="Nombre Completo"
                                className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus:border-orange-500 focus:ring-orange-500 text-sm"
                                required
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="email"
                                value={newUserEmail}
                                onChange={e => setNewUserEmail(e.target.value)}
                                placeholder="Email"
                                className="flex-1 h-10 px-3 rounded-lg border border-gray-300 focus:border-orange-500 focus:ring-orange-500 text-sm"
                                required
                            />
                            <input
                                type="text"
                                value={newUserPassword}
                                onChange={e => setNewUserPassword(e.target.value)}
                                placeholder="Contraseña"
                                className="w-full sm:w-40 h-10 px-3 rounded-lg border border-gray-300 focus:border-orange-500 focus:ring-orange-500 text-sm"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={addingUser}
                            className="h-10 px-4 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm w-full sm:w-auto self-end"
                        >
                            {addingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear Usuario"}
                        </button>
                    </form>
                    <p className="text-xs text-neutral-400 mt-2">
                        * Esto crea el usuario inmediatamente.
                    </p>
                </div>

                {/* User List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="font-bold text-neutral-800 text-sm flex items-center gap-2">
                            <Users className="w-4 h-4 text-neutral-500" />
                            Usuarios Habilitados
                        </h3>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-orange-500" /></div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {users.map(u => (
                                <div key={u.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-neutral-900">{u.name || 'Sin Nombre'}</p>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {u.role}
                                            </span>
                                        </div>
                                        <p className="text-xs text-neutral-500">{u.email}</p>
                                    </div>

                                    {u.role !== 'admin' && (
                                        <button
                                            onClick={() => setSelectedUser(u)}
                                            className="text-xs font-bold text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            Permisos
                                        </button>
                                    )}
                                </div>
                            ))}
                            {users.length === 0 && <p className="p-4 text-center text-neutral-400 text-sm">No hay usuarios.</p>}
                        </div>
                    )}
                </div>
            </div>

            {selectedUser && (
                <PermissionsModal
                    user={selectedUser}
                    onClose={() => { setSelectedUser(null); fetchUsers(); }}
                />
            )}
        </div>
    );
}

function PermissionsModal({ user, onClose }) {
    const [projects, setProjects] = useState([]);
    const [userPermissions, setUserPermissions] = useState(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            // Fetch all active projects
            const { data: allProjects } = await supabase
                .from('datos_licitaciones')
                .select('id_licitacion, nombre_abreviado')
                .eq('obra_activa', true)
                .order('nombre_abreviado');

            // Fetch user permissions
            const { data: perms } = await supabase
                .from('mobile_permissions')
                .select('licitacion_id')
                .eq('user_id', user.id);

            setProjects(allProjects || []);
            setUserPermissions(new Set(perms?.map(p => p.licitacion_id) || []));
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    const toggle = async (licitacionId) => {
        // Optimistic update locally
        const newSet = new Set(userPermissions);
        if (newSet.has(licitacionId)) newSet.delete(licitacionId);
        else newSet.add(licitacionId);
        setUserPermissions(newSet);

        // Call RPC
        try {
            await supabase.rpc('toggle_permission', {
                target_user_id: user.id,
                target_licitacion_id: licitacionId
            });
        } catch (err) {
            console.error(err);
            alert("Error al actualizar permiso");
            loadData(); // Revert on error
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="font-bold text-neutral-900">Permisos de Acceso</h3>
                        <p className="text-xs text-neutral-500">{user.email}</p>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-neutral-400 hover:text-neutral-700" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? <div className="p-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> : (
                        <div className="space-y-1">
                            {projects.map(p => {
                                const allowed = userPermissions.has(p.id_licitacion);
                                return (
                                    <button
                                        key={p.id_licitacion}
                                        onClick={() => toggle(p.id_licitacion)}
                                        className={`w-full text-left px-3 py-3 rounded-lg flex items-center justify-between transition-all ${allowed ? 'bg-orange-50 border border-orange-200' : 'hover:bg-gray-50 border border-transparent'}`}
                                    >
                                        <span className={`text-sm font-medium ${allowed ? 'text-orange-900' : 'text-neutral-600'}`}>{p.nombre_abreviado}</span>
                                        {allowed && <Check className="w-4 h-4 text-orange-600" />}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
