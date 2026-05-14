import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './services/supabase';
import { ProjectSelector } from './components/ProjectSelector';
import { ItemsList } from './components/ItemsList';
import { Login } from './components/Login';
import { ForgotPassword } from './components/ForgotPassword';
import { ResetPassword } from './components/ResetPassword';
import { AdminDashboard } from './components/AdminDashboard';
import { Loader2, LogOut } from 'lucide-react';
import logo from './assets/logo.png';
import { getMobileAccessState } from './services/mobileAccess';
import { clearAppStorage, getScopedStorageKey, readStorage, writeStorage } from './services/storage';

function getLocalIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


function App() {
  const currentPath = window.location.pathname;
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin', 'engineer', or null
  const [userName, setUserName] = useState(null); // NEW: Store User Name
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const currentUserIdRef = useRef(null);

  useEffect(() => {
    currentUserIdRef.current = session?.user?.id ?? null;
  }, [session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setSelectedProject(null);
      return;
    }

    try {
      const saved = readStorage(getScopedStorageKey(userId, 'engineer_project'));
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
        writeStorage(key, JSON.stringify(selectedProject));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      void 0;
    }
  }, [session?.user?.id, selectedProject]);

  const resetSessionState = useCallback(({ clearStorage = false } = {}) => {
    setSession(null);
    setUserRole(null);
    setUserName(null);
    setSelectedProject(null);
    if (clearStorage) {
      clearAppStorage();
    }
  }, []);

  const handleLogout = useCallback(async () => {
    clearAppStorage();
    await supabase.auth.signOut();
  }, []);

  const resolveSessionAccess = useCallback(async (nextSession, options = {}) => {
    const { silent = false } = options;

    if (!nextSession?.user) {
      resetSessionState();
      if (!silent) setLoading(false);
      return 'no-session';
    }

    if (!silent) {
      setLoading(true);
    }

    try {
      const access = await getMobileAccessState(nextSession.user.id);
      setSession(nextSession);
      setUserName(access.userName);

      if (access.status === 'authorized') {
        setUserRole(access.role);
        writeStorage(getScopedStorageKey(nextSession.user.id, 'active_day'), getLocalIsoDate());
        return 'authorized';
      }

      if (access.status === 'pending') {
        setUserRole('pending');
        writeStorage(getScopedStorageKey(nextSession.user.id, 'active_day'), getLocalIsoDate());
        return 'pending';
      }

      resetSessionState({ clearStorage: true });
      return 'unauthorized';
    } catch (err) {
      console.error(err);
      return 'error';
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [resetSessionState]);

  useEffect(() => {
    const isRecoveryPath = currentPath === '/reset-password' || window.location.href.includes('type=recovery');

    const hasDayExpired = (userId) => {
      if (!userId) return false;
      const dayKey = getScopedStorageKey(userId, 'active_day');
      const storedDay = readStorage(dayKey);
      const today = getLocalIsoDate();
      return !!(storedDay && storedDay !== today);
    };

    const expireIfNeeded = async (userId) => {
      if (!userId || isRecoveryPath) return false;
      if (!hasDayExpired(userId)) return false;
      await handleLogout();
      return true;
    };

    const revalidateCurrentAccess = async () => {
      const activeUserId = currentUserIdRef.current;
      if (!activeUserId) return;

      if (await expireIfNeeded(activeUserId)) return;

      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession?.user) return;

        const accessStatus = await resolveSessionAccess(currentSession, { silent: true });
        if (accessStatus === 'unauthorized' || accessStatus === 'pending') {
          await handleLogout();
        }
      } catch (error) {
        console.error('Error revalidating current mobile access:', error);
      }
    };

    const initAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();

        if (!initialSession) {
          setLoading(false);
          return;
        }

        if (await expireIfNeeded(initialSession.user.id)) {
          setLoading(false);
          return;
        }

        const accessStatus = await resolveSessionAccess(initialSession);
        if (accessStatus === 'unauthorized') {
          await supabase.auth.signOut();
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        resetSessionState();
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      window.setTimeout(() => {
        void (async () => {
          const incomingUserId = nextSession?.user?.id ?? null;
          const isSameUserSession = !!incomingUserId && currentUserIdRef.current === incomingUserId;

          if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
            if (isSameUserSession && event !== 'PASSWORD_RECOVERY') {
              setSession(nextSession);
              writeStorage(getScopedStorageKey(incomingUserId, 'active_day'), getLocalIsoDate());
              const accessStatus = await resolveSessionAccess(nextSession, { silent: true });
              if (accessStatus === 'unauthorized') {
                await handleLogout();
              }
            } else {
              if (currentUserIdRef.current && currentUserIdRef.current !== incomingUserId) {
                clearAppStorage();
              }
              await resolveSessionAccess(nextSession);
            }
            return;
          }

          if (event === 'TOKEN_REFRESHED') {
            if (nextSession) {
              setSession(nextSession);
              writeStorage(getScopedStorageKey(nextSession.user.id, 'active_day'), getLocalIsoDate());
            }
            return;
          }

          if (event === 'SIGNED_OUT') {
            resetSessionState({ clearStorage: true });
            setLoading(false);
          }
        })();
      }, 0);
    });

    const handleWindowReturn = () => {
      void revalidateCurrentAccess();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void revalidateCurrentAccess();
      }
    };

    initAuth();

    window.addEventListener('focus', handleWindowReturn);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const revalidationInterval = window.setInterval(() => {
      void revalidateCurrentAccess();
    }, 5 * 60 * 1000);
    const dayCheckInterval = window.setInterval(() => {
      const activeUserId = currentUserIdRef.current;
      if (!activeUserId) return;
      if (hasDayExpired(activeUserId)) {
        void handleLogout();
      }
    }, 60 * 1000);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('focus', handleWindowReturn);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(revalidationInterval);
      window.clearInterval(dayCheckInterval);
    };
  }, [currentPath, handleLogout, resetSessionState, resolveSessionAccess]);

  if (currentPath === '/forgot-password') {
    return <ForgotPassword />;
  }

  if (currentPath === '/reset-password') {
    return <ResetPassword onBackToLogin={() => window.location.replace('/')} />;
  }

  // 1. No Session -> Login
  if (!session) {
    return <Login />;
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
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
          key={`items-${session.user.id}-${selectedProject.id_licitacion}`}
          project={selectedProject}
          onBack={() => setSelectedProject(null)}
          currentRole={userRole}
          currentUserId={session.user.id}
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
          <ProjectSelector key={`projects-${session.user.id}`} onSelect={setSelectedProject} currentUserId={session.user.id} />
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
