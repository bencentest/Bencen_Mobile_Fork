import React, { useState, useEffect } from 'react';
import { supabase } from './services/supabase';
import { ProjectSelector } from './components/ProjectSelector';
import { ItemsList } from './components/ItemsList';
import { Login } from './components/Login';
import { AdminDashboard } from './components/AdminDashboard';
import { Loader2, LogOut } from 'lucide-react';
import { ActionSelector } from './components/ActionSelector';

function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin', 'engineer', or null
  const [userName, setUserName] = useState(null); // NEW: Store User Name
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [actionMode, setActionMode] = useState(null); // 'add' | 'history'

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
        setActionMode(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserRole = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('mobile_users')
        .select('role, name') // FETCH NAME
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setUserRole(data.role);
        setUserName(data.name);
      }
      else setUserRole('pending'); // User Auth exists but not in mobile_users
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
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
  if (userRole === 'admin') {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  // 4. Engineer -> Project Selection / Items
  const renderEngineerContent = () => {
    if (actionMode) {
      return (
        <ItemsList
          project={selectedProject}
          mode={actionMode}
          onBack={() => setActionMode(null)}
        />
      );
    }

    if (selectedProject) {
      return (
        <div className="p-4 pt-8">
          <ActionSelector
            project={selectedProject}
            onSelect={setActionMode}
            onBack={() => setSelectedProject(null)}
          />
        </div>
      );
    }

    return (
      <>
        {/* Header */}
        <div className="bg-[var(--accent)] text-white shadow-lg sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <span className="font-bold text-lg">B</span>
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
