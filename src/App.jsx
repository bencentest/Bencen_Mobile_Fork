import React, { useState, useEffect } from 'react';
import { supabase } from './services/supabase';
import { ProjectSelector } from './components/ProjectSelector';
import { ItemsList } from './components/ItemsList';
import { Login } from './components/Login';
import { AdminDashboard } from './components/AdminDashboard';
import { Loader2, LogOut } from 'lucide-react';
import logo from './assets/logo.png';


function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin', 'engineer', or null
  const [userName, setUserName] = useState(null); // NEW: Store User Name
  const [loading, setLoading] = useState(true);

  // Persistence for Engineer
  const [selectedProject, setSelectedProject] = useState(() => {
    try {
      const saved = localStorage.getItem('bencen_engineer_project');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  // Save selection
  useEffect(() => {
    if (selectedProject) {
      localStorage.setItem('bencen_engineer_project', JSON.stringify(selectedProject));
    } else {
      localStorage.removeItem('bencen_engineer_project');
    }
  }, [selectedProject]);

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
        localStorage.removeItem('bencen_engineer_project'); // Clear on logout/session end

        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserRole = async (userId) => {
    try {
      // New schema (preferred): reports_users.role_mobile -> usuarios_roles.id
      const { data: profile, error: profileError } = await supabase
        .from('reports_users')
        .select('name, role_mobile')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profile) {
        setUserName(profile.name);

        if (profile.role_mobile) {
          const { data: roleRow, error: roleError } = await supabase
            .from('usuarios_roles')
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

      // Fallback (legacy): mobile_users.role
      const { data: legacy, error: legacyError } = await supabase
        .from('mobile_users')
        .select('role, name')
        .eq('id', userId)
        .maybeSingle();

      if (legacyError) throw legacyError;

      if (legacy) {
        setUserRole(legacy.role);
        setUserName(legacy.name);
      } else {
        setUserRole('pending'); // User Auth exists but not in any profile table
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    // Clear all persistence
    localStorage.removeItem('bencen_engineer_project');
    localStorage.removeItem('bencen_admin_project');
    localStorage.removeItem('bencen_admin_showDetailed');

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
    return <AdminDashboard onLogout={handleLogout} currentRole={userRole} />;
  }

  // 4. Engineer -> Project Selection / Items
  const renderEngineerContent = () => {
    if (selectedProject) {
      return (
        <ItemsList
          project={selectedProject}
          onBack={() => setSelectedProject(null)}
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
