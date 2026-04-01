import React, { useState, useEffect } from 'react';
import { supabase } from './services/supabase';
import { ProjectSelector } from './components/ProjectSelector';
import { ItemsList } from './components/ItemsList';
import { Login } from './components/Login';
import { AdminDashboard } from './components/AdminDashboard';
import { Loader2, LogOut } from 'lucide-react';
import logo from './assets/logo.png';

const APP_STORAGE_PREFIX = 'bencen_';

function getScopedStorageKey(userId, suffix) {
  if (!userId) return `${APP_STORAGE_PREFIX}${suffix}`;
  return `${APP_STORAGE_PREFIX}${userId}_${suffix}`;
}

function clearAppStorage() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(APP_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    void 0;
  }
}

function getLocalIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin', 'engineer', or null
  const [userName, setUserName] = useState(null); // NEW: Store User Name
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setSelectedProject(null);
      return;
    }

    try {
      const saved = localStorage.getItem(getScopedStorageKey(userId, 'engineer_project'));
      setSelectedProject(saved ? JSON.parse(saved) : null);
    } catch {
      setSelectedProject(null);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const key = getScopedStorageKey(userId, 'engineer_project');
    try {
      if (selectedProject) {
        localStorage.setItem(key, JSON.stringify(selectedProject));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      void 0;
    }
  }, [session?.user?.id, selectedProject]);

  useEffect(() => {
    // 1. Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkUserRole(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkUserRole(session.user.id);
      else {
        setUserRole(null);
        setUserName(null);
        setSelectedProject(null);
        clearAppStorage();
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return undefined;

    const dayKey = getScopedStorageKey(userId, 'active_day');
    const today = getLocalIsoDate();

    try {
      const storedDay = localStorage.getItem(dayKey);
      if (storedDay && storedDay !== today) {
        void handleLogout();
        return undefined;
      }
      localStorage.setItem(dayKey, today);
    } catch {
      void 0;
    }

    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeoutMs = Math.max(1000, nextMidnight.getTime() - now.getTime());

    const timeoutId = window.setTimeout(() => {
      void handleLogout();
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [session?.user?.id]);

  const checkUserRole = async (userId) => {
    try {
      // New schema (preferred): Usuarios_Auth.role_mobile -> Usuarios_Roles.id
      const { data: profile, error: profileError } = await supabase
        .from('Usuarios_Auth')
        .select('name, role_mobile')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profile) {
        setUserName(profile.name);

        if (profile.role_mobile) {
          const { data: roleRow, error: roleError } = await supabase
            .from('Usuarios_Roles')
            .select('rol')
            .eq('id', profile.role_mobile)
            .maybeSingle();

          if (roleError) throw roleError;

          const roleName = roleRow?.rol ? String(roleRow.rol).toLowerCase() : null;
          setUserRole(roleName || 'pending');
          return;
        }

        // Auth exists + profile exists, but no role assigned yet
        setUserRole('pending');
        return;
      }

      setUserRole('pending'); // User Auth exists but not in Usuarios_Auth yet
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    clearAppStorage();
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  // 1. No Session -> Login
  if (!session) {
    return <Login onLoginSuccess={() => setLoading(true)} />;
  }

  // 2. Pending Role -> Waiting Screen
  if (userRole === 'pending') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center p-6 text-center bg-neutral-50">
        <div className="bg-orange-100 p-4 rounded-full mb-4">
          <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">Cuenta en Revisión</h2>
        <p className="text-neutral-600 max-w-xs mb-8">
          Tu usuario ya fue registrado ({session.user.email}) pero necesitás que un administrador te habilite.
        </p>
        <button onClick={handleLogout} className="text-sm font-bold text-neutral-500 hover:text-neutral-800">
          Cerrar Sesión
        </button>
      </div>
    );
  }

  // 3. Admin -> Dashboard
  if (userRole === 'admin' || userRole === 'admin_gerencia') {
    return <AdminDashboard onLogout={handleLogout} currentRole={userRole} currentUserId={session.user.id} />;
  }

  // 4. Engineer -> Project Selection / Items
  const renderEngineerContent = () => {
    if (selectedProject) {
      return (
        <ItemsList
          project={selectedProject}
          onBack={() => setSelectedProject(null)}
          currentRole={userRole}
        />
      );
    }

    return (
      <>
        {/* Header */}
        <div className="bg-[var(--accent)] text-white shadow-lg sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center backdrop-blur-sm overflow-hidden">
                <img src={logo} alt="Bencen" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-bold tracking-tight leading-none">Bencen Mobile</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                  <p className="text-orange-100 text-xs font-medium opacity-90">
                    {userName ? userName : session.user.email}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full hover:bg-white/20 transition-all text-sm font-medium backdrop-blur-sm"
            >
              <span className="hidden sm:inline">Cerrar Sesión</span>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <ProjectSelector onSelect={setSelectedProject} />
        </div>
      </>
    );
  };

  return (
    <div className='min-h-screen font-sans text-neutral-900 bg-gray-50'>
      {renderEngineerContent()}
    </div>
  );
}

export default App;
