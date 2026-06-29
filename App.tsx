
import React, { useState, useEffect, useCallback } from 'react';
import { User, Branch, AttendanceRecord, AppConfig, Job, ReportAccount, VisitPlan } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import ReportsView from './components/ReportsView';
import { ShieldCheck, User as UserIcon, Cloud, CloudOff, RefreshCw, FileSpreadsheet, Home, Download, Share, PlusSquare, X, Wifi } from 'lucide-react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reportAccounts, setReportAccounts] = useState<ReportAccount[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [visitPlans, setVisitPlans] = useState<VisitPlan[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeView, setActiveView] = useState<'main' | 'reports'>('main');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  
  // iOS Installation States
  const [isIos, setIsIos] = useState(false);
  const [isInStandaloneMode, setIsInStandaloneMode] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem('attendance_config');
    const defaultConfig = { 
      googleSheetLink: '',
      syncUrl: '',
      auditLogUrl: '',
      adminUsername: 'admin',
      adminPassword: 'B522129'
    };
    return saved ? { ...defaultConfig, ...JSON.parse(saved) } : defaultConfig;
  });

  useEffect(() => {
    // Android Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    });

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // Detect Standalone Mode (Installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsInStandaloneMode(isStandalone);
    
    // Online/Offline Status Listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          setInstallPrompt(null);
        }
      });
    } else if (isIos) {
      setShowIosInstructions(true);
    }
  };

  const syncWithCloud = useCallback(async (url: string, force: boolean = false) => {
    if (!url || !url.startsWith('http')) return;
    // Don't sync if offline
    if (!navigator.onLine) {
       setSyncError(true);
       return;
    }
    
    setIsSyncing(true);
    setSyncError(false);
    try {
      const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}action=getData&t=${Date.now()}`;
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error('فشل الاتصال');
      const data = await response.json();
      
      if (data.branches) {
        setBranches(data.branches);
        localStorage.setItem('attendance_branches', JSON.stringify(data.branches));
      }
      if (data.jobs) {
        setJobs(data.jobs);
        localStorage.setItem('attendance_jobs', JSON.stringify(data.jobs));
      }
      if (data.reportAccounts) {
        setReportAccounts(data.reportAccounts);
        localStorage.setItem('attendance_report_accounts', JSON.stringify(data.reportAccounts));
      }
      if (data.users && Array.isArray(data.users)) {
        setAllUsers(data.users);
        localStorage.setItem('attendance_users', JSON.stringify(data.users));
        
        // Update current user if already logged in (using functional update to avoid stale closure)
        setCurrentUser(prev => {
          if (prev && prev.role !== 'admin') {
            const updatedUser = data.users.find((u: User) => u.id === prev.id);
            if (updatedUser) {
              localStorage.setItem('attendance_current_user', JSON.stringify(updatedUser));
              return updatedUser;
            }
          }
          return prev;
        });
      }
      if (data.visitPlans) {
        setVisitPlans(data.visitPlans);
        localStorage.setItem('attendance_visit_plans', JSON.stringify(data.visitPlans));
      }
      
      setConfig(prev => {
        const updatedConfig = { ...prev, lastUpdated: new Date().toISOString(), syncUrl: url, googleSheetLink: url };
        if (data.holidays) updatedConfig.holidays = data.holidays;
        localStorage.setItem('attendance_config', JSON.stringify(updatedConfig));
        return updatedConfig;
      });
    } catch (err) {
      setSyncError(true);
      logAction('فشل المزامنة مع السحابة', `الخطأ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  }, []); // No dependencies to avoid infinite loops

  // Initial Data Load
  useEffect(() => {
    const savedUser = localStorage.getItem('attendance_current_user');
    const savedBranches = localStorage.getItem('attendance_branches');
    const savedJobs = localStorage.getItem('attendance_jobs');
    const savedPlans = localStorage.getItem('attendance_visit_plans');
    const savedUsers = localStorage.getItem('attendance_users');
    const savedReportAccounts = localStorage.getItem('attendance_report_accounts');
    
    if (savedUser) setCurrentUser(JSON.parse(savedUser));
    if (savedBranches) setBranches(JSON.parse(savedBranches));
    if (savedJobs) setJobs(JSON.parse(savedJobs));
    if (savedPlans) setVisitPlans(JSON.parse(savedPlans));
    if (savedUsers) setAllUsers(JSON.parse(savedUsers));
    if (savedReportAccounts) setReportAccounts(JSON.parse(savedReportAccounts));
    
    // Check URL params for cloud link
    const params = new URLSearchParams(window.location.search);
    const cloudUrlEncoded = params.get('c');
    let urlToSync = config.syncUrl;

    if (cloudUrlEncoded) {
      try {
        const decodedUrl = atob(cloudUrlEncoded);
        if (decodedUrl.startsWith('http')) {
          urlToSync = decodedUrl;
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {}
    }

    if (urlToSync) {
      syncWithCloud(urlToSync);
    }
  }, []);

  // Continuous Auto-Reconnect & Periodic Sync
  useEffect(() => {
     if (!config.syncUrl) return;

     // STOP Auto-Sync for Admin to allow local editing without overwrites
     if (currentUser?.role === 'admin') return;

     // 1. Sync immediately when coming back online
     if (isOnline) {
       syncWithCloud(config.syncUrl);
     }

     // 2. Poll every 2 seconds to keep data fresh if online (for non-admin users)
     const intervalId = setInterval(() => {
       if (navigator.onLine) {
         syncWithCloud(config.syncUrl);
       }
     }, 300000); // 2 seconds interval

     return () => clearInterval(intervalId);
  }, [isOnline, config.syncUrl, syncWithCloud, currentUser]);

  // Check for global updates from GitHub static file
  useEffect(() => {
    const checkForUpdates = async () => {
      if (!navigator.onLine) return;
      try {
        const res = await fetch('./server-config.json?t=' + Date.now());
        if (res.ok) {
          const data = await res.json();
          if (data && data.googleSheetLink && data.googleSheetLink.startsWith('http')) {
            const saved = localStorage.getItem('attendance_config');
            const currentConfig = saved ? JSON.parse(saved) : null;
            
            const hasChanges = !currentConfig || 
                              data.googleSheetLink !== currentConfig.syncUrl || 
                              (data.auditLogUrl !== undefined && data.auditLogUrl !== currentConfig.auditLogUrl);

            if (hasChanges) {
              setConfig(prev => {
                const updatedConfig = { 
                  ...prev, 
                  syncUrl: data.googleSheetLink, 
                  googleSheetLink: data.googleSheetLink,
                  auditLogUrl: data.auditLogUrl !== undefined ? data.auditLogUrl : prev.auditLogUrl
                };
                localStorage.setItem('attendance_config', JSON.stringify(updatedConfig));
                return updatedConfig;
              });
              syncWithCloud(data.googleSheetLink);
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    };

    checkForUpdates();
    const interval = setInterval(checkForUpdates, 5 * 60000); // Check every 5 minutes
    return () => clearInterval(interval);
  }, [syncWithCloud]);

  useEffect(() => { localStorage.setItem('attendance_branches', JSON.stringify(branches)); }, [branches]);
  useEffect(() => { localStorage.setItem('attendance_jobs', JSON.stringify(jobs)); }, [jobs]);
  useEffect(() => { localStorage.setItem('attendance_visit_plans', JSON.stringify(visitPlans)); }, [visitPlans]);

  const logAction = useCallback(async (action: string, details: string = '') => {
    if (!config.syncUrl) return;
    
    try {
      const payload = {
        action: 'logAudit',
        user: currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'Guest',
        auditAction: action,
        details: details,
        deviceInfo: navigator.userAgent,
        spreadsheetId: config.auditLogUrl || ''
      };
      
      await fetch(config.syncUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Audit Log Error:', e);
    }
  }, [config.syncUrl, config.auditLogUrl, currentUser]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('attendance_current_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    if (currentUser) {
      logAction('تسجيل خروج', `المستخدم: ${currentUser.fullName} (${currentUser.role})`);
    }
    localStorage.removeItem('attendance_current_user');
    setCurrentUser(null);
    setActiveView('main');
  };

  const handleUpdateConfig = (newCfg: Partial<AppConfig>) => {
    const cfg = { ...config, ...newCfg };
    setConfig(cfg);
    localStorage.setItem('attendance_config', JSON.stringify(cfg));
  };

  // Determine if we should show an install button (Android or iOS web)
  const showInstallButton = !isInStandaloneMode && (installPrompt || isIos);

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 h-16">
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl text-white">
              {currentUser?.role === 'admin' ? <ShieldCheck size={24} /> : <UserIcon size={24} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-gray-800 text-lg uppercase tracking-tighter">Uniteam</h1>
                {isSyncing ? (
                  <RefreshCw size={14} className="text-blue-500 animate-spin" />
                ) : isOnline && config.syncUrl ? (
                  <div className="flex items-center gap-1">
                    {currentUser?.role === 'admin' ? (
                      <span className="text-[10px] text-orange-500 font-bold border border-orange-200 bg-orange-50 px-1.5 py-0.5 rounded">Manual Sync</span>
                    ) : (
                      <>
                        <Cloud size={14} className="text-green-500" />
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                      </>
                    )}
                  </div>
                ) : (
                  <CloudOff size={14} className="text-red-500" />
                )}
              </div>
              {currentUser && <p className="text-[10px] text-gray-500 font-black">{currentUser.fullName}</p>}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {showInstallButton && (
               <button 
                 onClick={handleInstallClick}
                 className="hidden md:flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black shadow-lg hover:bg-green-500 transition-all animate-pulse"
               >
                 <Download size={14} /> {isIos ? 'تثبيت على الآيفون' : 'تثبيت التطبيق'}
               </button>
             )}
             
             {!currentUser && (
               <div className="flex bg-slate-100 p-1 rounded-xl">
                 <button 
                   onClick={() => setActiveView('main')} 
                   className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-1.5 ${activeView === 'main' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                 >
                   <Home size={14} /> الرئيسية
                 </button>
                 <button 
                   onClick={() => setActiveView('reports')} 
                   className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-1.5 ${activeView === 'reports' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                 >
                   <FileSpreadsheet size={14} /> Reports
                 </button>
               </div>
             )}
             {currentUser && <button onClick={handleLogout} className="px-4 py-2 text-xs font-black text-red-600 bg-red-50 rounded-xl">خروج</button>}
          </div>
        </div>
        
        {!isOnline && (
          <div className="absolute top-full left-0 w-full bg-red-500 text-white text-[10px] font-black py-1 text-center animate-in slide-in-from-top-1">
            لا يوجد اتصال بالإنترنت - يتم العمل في الوضع غير المتصل
          </div>
        )}

        {showInstallButton && (
           <button 
             onClick={handleInstallClick}
             className="md:hidden w-full bg-green-600 text-white py-2 text-xs font-black flex justify-center items-center gap-2"
           >
             <Download size={16} /> {isIos ? 'تثبيت Uniteam على الآيفون' : 'تثبيت Uniteam على هاتفك'}
           </button>
         )}
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 pb-24">
        {activeView === 'reports' && !currentUser ? (
          <ReportsView syncUrl={config.syncUrl} adminConfig={config} onUpdateConfig={handleUpdateConfig} logAction={logAction} />
        ) : (
          !currentUser ? (
            <Login 
              onLogin={handleLogin} allUsers={allUsers} adminConfig={config} availableJobs={jobs}
              branches={branches} 
              setAdminConfig={handleUpdateConfig}
              logAction={logAction}
            />
          ) : (
            currentUser.role === 'admin' ? (
              <AdminDashboard 
                branches={branches} setBranches={setBranches} jobs={jobs} setJobs={setJobs}
                records={records} config={config} setConfig={setConfig} allUsers={allUsers} setAllUsers={setAllUsers}
                reportAccounts={reportAccounts} setReportAccounts={setReportAccounts}
                visitPlans={visitPlans} setVisitPlans={setVisitPlans}
                onRefresh={() => syncWithCloud(config.syncUrl)} isSyncing={isSyncing}
                logAction={logAction}
              />
            ) : (
              <UserDashboard 
                user={currentUser} branches={branches} records={records} setRecords={setRecords}
                visitPlans={visitPlans}
                googleSheetLink={config.googleSheetLink} onRefresh={() => syncWithCloud(config.syncUrl)}
                isSyncing={isSyncing} lastUpdated={config.lastUpdated}
                logAction={logAction}
              />
            )
          )
        )}
      </main>
      
      <footer className="py-4 text-center relative z-10 text-slate-900 text-[10px] font-bold pb-6">
        <p>Uniteam &copy; 2026</p>
        <p className="mt-0.5 opacity-70">RTM Team - Bahaa Mohamed-Tel: 01095665450</p>
      </footer>

      {/* iOS Installation Instructions Modal */}
      {showIosInstructions && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl p-6 relative animate-in slide-in-from-bottom-10 duration-300">
            <button 
              onClick={() => setShowIosInstructions(false)}
              className="absolute left-4 top-4 text-slate-400 hover:text-white"
            >
              <X size={24} />
            </button>
            <div className="text-center space-y-4 pt-4">
              <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-900/30">
                <Download size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-black text-white">تثبيت التطبيق على الآيفون</h3>
              <p className="text-slate-400 text-xs font-bold leading-relaxed">
                نظراً لسياسات آبل، يرجى اتباع الخطوات التالية يدوياً لتثبيت التطبيق:
              </p>
              <div className="space-y-3 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 text-right">
                <div className="flex items-center gap-3 text-white text-sm font-bold">
                  <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-[10px]">1</span>
                  <span>اضغط على زر المشاركة في الأسفل</span>
                  <Share size={18} className="mr-auto text-blue-400" />
                </div>
                <div className="w-full h-px bg-slate-700/50"></div>
                <div className="flex items-center gap-3 text-white text-sm font-bold">
                  <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-[10px]">2</span>
                  <span>اختر "إضافة إلى الصفحة الرئيسية"</span>
                  <PlusSquare size={18} className="mr-auto text-blue-400" />
                </div>
                <div className="w-full h-px bg-slate-700/50"></div>
                <div className="flex items-center gap-3 text-white text-sm font-bold">
                  <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-[10px]">3</span>
                  <span>اضغط على "إضافة" (Add) في الأعلى</span>
                </div>
              </div>
              <button 
                onClick={() => setShowIosInstructions(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black py-3 rounded-xl transition-colors"
              >
                فهمت ذلك
              </button>
            </div>
            {/* Pointer arrow for mobile Safari */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full text-white animate-bounce md:hidden">
              <div className="flex flex-col items-center gap-2 mt-4">
                 <span className="text-[10px] font-black">اضغط هنا</span>
                 <svg width="24" height="24" viewBox="0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

