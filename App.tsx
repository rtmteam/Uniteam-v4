
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Branch, AttendanceRecord, AppConfig, Job, ReportAccount, VisitPlan } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import ReportsView from './components/ReportsView';
import { ShieldCheck, User as UserIcon, Cloud, CloudOff, RefreshCw, FileSpreadsheet, Home, Download, Share, PlusSquare, X, Wifi, LogOut } from 'lucide-react';
import { syncTimeWithServer, sanitizeUrl } from './utils';

// ==========================================
// المصدر الرئيسي الوحيد لكلمة مرور المسؤول (Admin Password)
// يمكنك تغييرها هنا مباشرة وسيتم تحديثها تلقائياً في كل التطبيق
const ADMIN_PASSWORD_SSOT = 'adminAcc';
// ==========================================

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
      adminPassword: ADMIN_PASSWORD_SSOT
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Always force adminPassword to be the ADMIN_PASSWORD_SSOT from the code, ignoring any saved password
        return { ...defaultConfig, ...parsed, adminPassword: ADMIN_PASSWORD_SSOT };
      } catch (e) {
        return defaultConfig;
      }
    }
    return defaultConfig;
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

  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const [syncToast, setSyncToast] = useState<string | null>(null);

  const syncWithCloud = useCallback(async (url?: string, force: boolean = false): Promise<boolean> => {
    const rawTarget = (url && url.startsWith('http')) ? url : (configRef.current.syncUrl || configRef.current.googleSheetLink);
    const targetUrl = sanitizeUrl(rawTarget);
    if (!targetUrl || !targetUrl.startsWith('http')) return false;
    
    // Don't sync if offline
    if (!navigator.onLine) {
       setSyncError(true);
       return false;
    }
    
    setIsSyncing(true);
    setSyncError(false);
    try {
      // مزامنة الوقت بالخلفية لضمان دقة ساعة التطبيق بالتوقيت المصري وحمايته من التلاعب
      syncTimeWithServer().catch(e => console.warn('Background time sync failed', e));

      const fetchUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}action=getData&t=${Date.now()}`;
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
        // Security: Strip passwords before saving to localStorage
        const safeAccounts = (data.reportAccounts || []).map(({ password, ...acc }: any) => acc);
        localStorage.setItem('attendance_report_accounts', JSON.stringify(safeAccounts));
      }
      if (data.users && Array.isArray(data.users)) {
        setAllUsers(data.users);
        // Security: Strip passwords before saving users to localStorage
        const safeUsers = data.users.map(({ password, ...u }: any) => u);
        localStorage.setItem('attendance_users', JSON.stringify(safeUsers));
        
        // Update current user if already logged in
        setCurrentUser(prev => {
          if (prev && prev.role !== 'admin') {
            const updatedUser = data.users.find((u: User) => u.id === prev.id);
            if (updatedUser) {
              const { password, ...safeUpdatedUser } = updatedUser;
              localStorage.setItem('attendance_current_user', JSON.stringify(safeUpdatedUser));
              return safeUpdatedUser as User;
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
        const updatedConfig = { ...prev, lastUpdated: new Date().toISOString(), syncUrl: targetUrl, googleSheetLink: targetUrl };
        if (data.holidays) updatedConfig.holidays = data.holidays;
        const { adminPassword, ...configToSave } = updatedConfig;
        localStorage.setItem('attendance_config', JSON.stringify(configToSave));
        return updatedConfig;
      });
      return true;
    } catch (err) {
      setSyncError(true);
      logAction('فشل المزامنة مع السحابة', `الخطأ: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, []); // Truly stable callback to prevent infinite sync loops

  const fetchLatestServerConfig = useCallback(async (): Promise<string | null> => {
    if (!navigator.onLine) return null;
    try {
      const res = await fetch('./server-config.json?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        const rawSheetLink = data?.googleSheetLink || data?.syncUrl;
        const sheetLink = sanitizeUrl(rawSheetLink);
        if (sheetLink && sheetLink.startsWith('http')) {
          setConfig(prev => {
            const updatedConfig = { 
              ...prev, 
              syncUrl: sheetLink, 
              googleSheetLink: sheetLink,
              auditLogUrl: data.auditLogUrl !== undefined ? data.auditLogUrl : prev.auditLogUrl
            };
            const { adminPassword, ...configToSave } = updatedConfig;
            localStorage.setItem('attendance_config', JSON.stringify(configToSave));
            return updatedConfig;
          });
          return sheetLink;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch server-config.json', e);
    }
    return null;
  }, []);

  const handleManualRefresh = async () => {
    setSyncToast('جاري تحديث الرابط والبيانات من السحابة...');
    
    // 1. Refresh link from server-config.json first
    const freshLink = await fetchLatestServerConfig();
    const targetUrl = freshLink || configRef.current.syncUrl || configRef.current.googleSheetLink || config.syncUrl || config.googleSheetLink;

    if (!targetUrl) {
      setSyncToast('يرجى التأكد من ربط التطبيق بشيت جوجل أولاً');
      setTimeout(() => setSyncToast(null), 3000);
      return;
    }
    
    // 2. Perform sync using the targetUrl
    const success = await syncWithCloud(targetUrl, true);
    if (success) {
      setSyncToast('تم تحديث الرابط وجميع البيانات بنجاح!');
    } else {
      setSyncToast('حدث خطأ أثناء المزامنة، تأكد من الاتصال بالإنترنت');
    }
    setTimeout(() => setSyncToast(null), 3000);
  };

  // Initial Data Load
  useEffect(() => {
    // مزامنة الوقت فور تشغيل التطبيق
    syncTimeWithServer().catch(e => console.warn('On-load time sync failed', e));

    const savedUser = localStorage.getItem('attendance_current_user');
    const savedBranches = localStorage.getItem('attendance_branches');
    const savedJobs = localStorage.getItem('attendance_jobs');
    const savedPlans = localStorage.getItem('attendance_visit_plans');
    const savedUsers = localStorage.getItem('attendance_users');
    const savedReportAccounts = localStorage.getItem('attendance_report_accounts');
    
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        delete parsed.password; // Security: Ensure no password in state or storage
        setCurrentUser(parsed);
        localStorage.setItem('attendance_current_user', JSON.stringify(parsed));
      } catch (e) {}
    }
    if (savedBranches) setBranches(JSON.parse(savedBranches));
    if (savedJobs) setJobs(JSON.parse(savedJobs));
    if (savedPlans) setVisitPlans(JSON.parse(savedPlans));
    if (savedUsers) {
      try {
        const parsed = JSON.parse(savedUsers);
        const cleaned = Array.isArray(parsed) ? parsed.map(({ password, ...u }: any) => u) : [];
        setAllUsers(cleaned);
        localStorage.setItem('attendance_users', JSON.stringify(cleaned));
      } catch (e) {}
    }
    if (savedReportAccounts) {
      try {
        const parsed = JSON.parse(savedReportAccounts);
        const cleaned = Array.isArray(parsed) ? parsed.map(({ password, ...acc }: any) => acc) : [];
        setReportAccounts(cleaned);
        localStorage.setItem('attendance_report_accounts', JSON.stringify(cleaned));
      } catch (e) {}
    }
    
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

  // Periodic Auto-Sync (Every 1 minute) & Reconnect Listener
  useEffect(() => {
     if (!config.syncUrl || currentUser?.role === 'admin') return;

     // Poll every 1 minute (60,000 ms) to keep data fresh
     const intervalId = setInterval(() => {
       if (navigator.onLine && configRef.current.syncUrl) {
         syncWithCloud(configRef.current.syncUrl);
       }
     }, 60000); // 1 minute interval

     return () => clearInterval(intervalId);
  }, [config.syncUrl, currentUser?.role, syncWithCloud]);

  // Check for global updates from GitHub static file
  useEffect(() => {
    const checkForUpdates = async () => {
      if (!navigator.onLine) return;
      const newLink = await fetchLatestServerConfig();
      if (newLink && newLink !== configRef.current.syncUrl) {
        syncWithCloud(newLink);
      }
    };

    checkForUpdates();
    const interval = setInterval(checkForUpdates, 5 * 60000); // Check every 5 minutes
    return () => clearInterval(interval);
  }, [fetchLatestServerConfig, syncWithCloud]);

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
    // Security: Do not store password in state or localStorage
    const { password, ...safeUser } = user;
    setCurrentUser(safeUser as User);
    localStorage.setItem('attendance_current_user', JSON.stringify(safeUser));
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
    const cfg = { ...config, ...newCfg, adminPassword: ADMIN_PASSWORD_SSOT };
    setConfig(cfg);
    const { adminPassword, ...configToSave } = cfg;
    localStorage.setItem('attendance_config', JSON.stringify(configToSave));
  };

  // Determine if we should show an install button (Android or iOS web)
  const showInstallButton = !isInStandaloneMode && (installPrompt || isIos);

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 h-16">
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <div className="bg-blue-600 p-2 rounded-xl text-white">
              {currentUser?.role === 'admin' ? <ShieldCheck size={22} /> : <UserIcon size={22} />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-black text-gray-800 text-base md:text-lg uppercase tracking-tighter">Uniteam</h1>
                {isSyncing ? (
                  <RefreshCw size={14} className="text-blue-500 animate-spin" />
                ) : isOnline && config.syncUrl ? (
                  <div className="flex items-center gap-1">
                    {currentUser?.role === 'admin' ? (
                      <span className="text-[9px] text-orange-500 font-bold border border-orange-200 bg-orange-50 px-1 py-0.5 rounded">Sync Active</span>
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
              {currentUser && <p className="text-[10px] text-gray-500 font-black truncate max-w-[120px] md:max-w-[180px]">{currentUser.fullName}</p>}
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 md:gap-2">
            {/* Global Refresh/Sync Button visible on ALL pages */}
            <button
              onClick={handleManualRefresh}
              disabled={isSyncing}
              title="تحديث بيانات التطبيق "
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm active:scale-95 border ${
                isSyncing
                  ? 'bg-blue-100 text-blue-700 border-blue-300 cursor-wait'
                  : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:shadow'
              }`}
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{isSyncing ? 'جاري التحديث...' : 'تحديث البيانات'}</span>
              <span className="sm:hidden">{isSyncing ? '...' : 'تحديث'}</span>
            </button>

            {showInstallButton && (
               <button 
                 onClick={handleInstallClick}
                 className="hidden md:flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black shadow-lg hover:bg-green-500 transition-all animate-pulse"
               >
                 <Download size={14} /> {isIos ? 'تثبيت آيفون' : 'تثبيت'}
               </button>
             )}
             
             {!currentUser && (
               <div className="flex bg-slate-100 p-1 rounded-xl">
                 <button 
                   onClick={() => setActiveView('main')} 
                   className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 ${activeView === 'main' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                 >
                   <Home size={14} /> الرئيسية
                 </button>
                 <button 
                   onClick={() => setActiveView('reports')} 
                   className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 ${activeView === 'reports' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                 >
                   <FileSpreadsheet size={14} /> Reports
                 </button>
               </div>
             )}
             {currentUser && (
                <button 
                  onClick={handleLogout} 
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black text-red-600 bg-red-50 hover:bg-red-600 hover:text-white border border-red-200 hover:border-red-600 rounded-xl transition-all shadow-sm active:scale-95 shrink-0"
                  title="تسجيل الخروج من التطبيق"
                >
                  <LogOut size={14} />
                  <span>تسجيل خروج</span>
                </button>
              )}
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
             className="md:hidden w-full bg-green-600 text-white py-1.5 text-xs font-black flex justify-center items-center gap-2"
           >
             <Download size={14} /> {isIos ? 'تثبيت Uniteam على الآيفون' : 'تثبيت Uniteam على هاتفك'}
           </button>
         )}
      </header>

      {/* Sync Toast Notification */}
      {syncToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white border border-slate-700 px-5 py-2.5 rounded-2xl shadow-2xl text-xs font-black flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <RefreshCw size={15} className={`text-blue-400 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{syncToast}</span>
        </div>
      )}

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
              onSync={syncWithCloud}
            />
          ) : (
            currentUser.role === 'admin' ? (
              <AdminDashboard 
                branches={branches} setBranches={setBranches} jobs={jobs} setJobs={setJobs}
                records={records} config={config} setConfig={setConfig} allUsers={allUsers} setAllUsers={setAllUsers}
                reportAccounts={reportAccounts} setReportAccounts={setReportAccounts}
                visitPlans={visitPlans} setVisitPlans={setVisitPlans}
                onRefresh={() => syncWithCloud(config.syncUrl, true)} isSyncing={isSyncing}
                logAction={logAction}
              />
            ) : (
              <UserDashboard 
                user={currentUser} branches={branches} records={records} setRecords={setRecords}
                visitPlans={visitPlans}
                googleSheetLink={config.googleSheetLink} onRefresh={() => syncWithCloud(config.syncUrl, true)}
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
