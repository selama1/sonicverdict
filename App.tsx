import React, { useState, useRef, useEffect } from 'react';
import { Activity, Upload, Mic2, Play, Award, Zap, AlertCircle, Music, User as UserIcon, FileAudio, Info, X, ExternalLink, Share2, Target, Sliders, TrendingUp, Download, Cpu, Mail, LogOut, History, ArrowLeft, Lock, Quote } from 'lucide-react';
import { analyzeAudio, generatePanelDiscussionStream } from './services/geminiService';
import { userService } from './services/userService';
import { ProducerReport, FileData, Step, ScoreItem, AIUsage, User, SavedReport } from './types';
import { AnalysisRadarChart } from './components/RadarChart';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// Helper to convert file to base64
const fileToGenerativePart = async (file: File): Promise<FileData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Extract the base64 data part
      const base64 = base64String.split(',')[1];
      resolve({
        base64,
        mimeType: file.type,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

function App() {
  const [step, setStep] = useState<Step>(Step.INPUT);
  const [formData, setFormData] = useState({
    artistName: '',
    songName: '',
    intent: '',
    aiUsage: AIUsage.NONE as string
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ProducerReport | null>(null);
  const [panelTranscript, setPanelTranscript] = useState<string>('');
  const [isStreamingPanel, setIsStreamingPanel] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isPdfMode, setIsPdfMode] = useState(false); // Toggle for compact layout

  // User Management State
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<SavedReport[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // Initialize User
  useEffect(() => {
    const currentUser = userService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      setHistory(userService.getHistory(currentUser));
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return;
    setAuthError(null);
    
    try {
        let u: User;
        if (authMode === 'login') {
        u = userService.login(authEmail, authPassword);
        } else {
        u = userService.register(authEmail, authPassword);
        }
        setUser(u);
        setHistory(userService.getHistory(u));
        setShowAuth(false);
        setAuthEmail('');
        setAuthPassword('');
    } catch (err: any) {
        setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    userService.logout();
    setUser(null);
    setHistory([]);
    setStep(Step.INPUT);
    setReport(null);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please upload an audio file.");
      return;
    }
    if (!process.env.API_KEY) {
        setError("API Key is missing. Cannot proceed.");
        return;
    }

    setStep(Step.ANALYZING);
    setError(null);

    try {
      const fileData = await fileToGenerativePart(file);
      const result = await analyzeAudio(formData.artistName, formData.songName, formData.intent, formData.aiUsage, fileData);
      setReport(result);
      setStep(Step.REPORT);
      
      // Auto-save if logged in
      if (user) {
        userService.saveReport(user, result);
        setHistory(userService.getHistory(user));
      }
    } catch (err) {
      console.error(err);
      setError("Failed to analyze audio. Please try again with a shorter file or ensure your API key is valid.");
      setStep(Step.INPUT);
    }
  };

  const loadHistoryItem = (item: SavedReport) => {
    setReport(item.report);
    setFormData({
      artistName: item.artistName,
      songName: item.songName,
      intent: '', // Intent isn't saved in history display but could be added to SavedReport type
      aiUsage: AIUsage.NONE
    });
    setStep(Step.REPORT);
    setShowHistory(false);
  };

  const handleConvenedPanel = async () => {
    if (!report) return;
    setStep(Step.DISCUSSING);
    setIsStreamingPanel(true);
    
    try {
      await generatePanelDiscussionStream(report, (chunk) => {
        setPanelTranscript(prev => prev + chunk);
      });
      setIsStreamingPanel(false);
      setStep(Step.FULL_VIEW);
    } catch (err) {
      console.error(err);
      setError("Panel discussion failed to load.");
      setIsStreamingPanel(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    
    setIsGeneratingPDF(true);
    setIsPdfMode(true); // Trigger compact layout for PDF generation

    // Allow DOM to update with new layout
    // Increased timeout to ensure grid layout fully repaints before capture
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      // Store original styles
      const originalWidth = reportRef.current.style.width;
      const originalMaxWidth = reportRef.current.style.maxWidth;
      const originalPadding = reportRef.current.style.padding;

      // Force a specific fixed width on the container for capture
      // This ensures grid-cols-4 and other layout elements render in a "desktop" mode
      // regardless of the actual viewport size.
      reportRef.current.style.width = '1000px';
      reportRef.current.style.maxWidth = 'none';
      reportRef.current.style.padding = '20px';

      // Initialize PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);
      
      let currentY = margin;

      // Select all elements marked as PDF sections
      // IMPORTANT: Elements must be visible in the viewport for html2canvas to capture them correctly in some cases,
      // but typically creating a specific width override handles it.
      const sections = reportRef.current.querySelectorAll('.pdf-section');
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i] as HTMLElement;
        
        // Capture section with fixed window width option
        const canvas = await html2canvas(section, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#0a0a0c', // Match background
          logging: false,
          windowWidth: 1000 // Ensure media queries (if any) match desktop
        });

        const imgData = canvas.toDataURL('image/png');
        const imgProps = pdf.getImageProperties(imgData);
        // Calculate height to fit the PDF content width
        const imgHeight = (imgProps.height * contentWidth) / imgProps.width;

        // Check if we need a new page
        if (currentY + imgHeight > pageHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }

        pdf.addImage(imgData, 'PNG', margin, currentY, contentWidth, imgHeight);
        currentY += imgHeight + 5; // Add padding between sections
      }

      // Restore original styles
      reportRef.current.style.width = originalWidth;
      reportRef.current.style.maxWidth = originalMaxWidth;
      reportRef.current.style.padding = originalPadding;

      pdf.save(`${formData.songName.replace(/\s+/g, '_')}_SongRater_Report.pdf`);
    } catch (err) {
      console.error("PDF Generation failed", err);
      setError("Failed to generate PDF.");
    } finally {
      setIsPdfMode(false); // Revert layout
      setIsGeneratingPDF(false);
    }
  };

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [panelTranscript]);

  const renderAuthModal = () => {
    if (!showAuth) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowAuth(false)}></div>
        <div className="relative bg-studio-800 border border-studio-600 rounded-2xl p-8 max-w-md w-full shadow-2xl animate-fade-in">
          <button onClick={() => setShowAuth(false)} className="absolute top-4 right-4 text-studio-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            {authMode === 'login' ? 'Producer Login' : 'Join the Label'}
          </h2>

          {authError && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
                  {authError}
              </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs text-studio-400 uppercase mb-1">Email Address</label>
              <input 
                type="email" 
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full bg-studio-900 border border-studio-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-studio-accent outline-none"
                placeholder="producer@studio.com"
              />
            </div>
            <div>
              <label className="block text-xs text-studio-400 uppercase mb-1">Password</label>
              <input 
                type="password" 
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full bg-studio-900 border border-studio-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-studio-accent outline-none"
                placeholder="••••••••"
              />
            </div>
            <button className="w-full bg-studio-accent hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition">
              {authMode === 'login' ? 'Access Dashboard' : 'Create Account'}
            </button>
          </form>
          
          <div className="mt-4 text-center">
            <button 
              onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(null); }}
              className="text-sm text-studio-400 hover:text-white underline"
            >
              {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Login"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderHistoryModal = () => {
    if (!showHistory) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
        <div className="relative bg-studio-800 border border-studio-600 rounded-2xl p-8 max-w-3xl w-full shadow-2xl animate-fade-in max-h-[80vh] flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <History className="w-6 h-6 text-studio-accent" />
              Analysis History
            </h2>
            <button onClick={() => setShowHistory(false)} className="text-studio-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-3">
            {history.length === 0 ? (
              <div className="text-center py-10 text-studio-400">No reports saved yet.</div>
            ) : (
              history.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => loadHistoryItem(item)}
                  className="flex items-center justify-between p-4 bg-studio-900/50 hover:bg-studio-700 border border-studio-700 rounded-xl cursor-pointer transition group"
                >
                  <div>
                    <h3 className="font-bold text-white group-hover:text-studio-accent transition">{item.songName}</h3>
                    <p className="text-sm text-studio-400">{item.artistName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-studio-500 font-mono">{new Date(item.date).toLocaleDateString()}</p>
                    <div className="flex items-center gap-1 text-xs text-studio-400 mt-1">
                      <span>View Report</span>
                      <ArrowLeft className="w-3 h-3 rotate-180" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAboutModal = () => {
    if (!showAbout) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAbout(false)}></div>
        <div className="relative bg-studio-800 border border-studio-600 rounded-2xl p-8 max-w-lg w-full shadow-2xl animate-fade-in overflow-y-auto max-h-[90vh]">
          <button 
            onClick={() => setShowAbout(false)}
            className="absolute top-4 right-4 text-studio-400 hover:text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="mb-6 flex items-center gap-3">
            <div className="w-12 h-12 bg-studio-accent rounded-lg flex items-center justify-center">
              <Award className="text-white w-7 h-7" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">SongRater.ai</h3>
              <p className="text-studio-400 text-sm">AI-Powered Music Analysis</p>
            </div>
          </div>

          <div className="space-y-4 text-gray-300 leading-relaxed text-sm">
            <p>
              SongRater.ai deconstructs audio files into producer-grade intelligence reports and simulates a panel of industry experts debating the track's potential. It helps artists understand how their music is perceived through various professional lenses.
            </p>
            
            <div className="bg-studio-900/50 p-4 rounded-lg border border-studio-700 my-4 space-y-3">
                <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-studio-500 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-xs font-bold text-studio-400 uppercase mb-1">Disclaimer</p>
                        <p className="text-xs text-studio-500">
                            This tool uses artificial intelligence to analyze audio. Results are subjective simulations and should be used for educational and creative purposes only. It does not guarantee market success.
                        </p>
                    </div>
                </div>
                 <div className="flex items-start gap-2">
                    <Lock className="w-4 h-4 text-studio-500 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-xs font-bold text-studio-400 uppercase mb-1">Privacy Policy</p>
                        <p className="text-xs text-studio-500">
                            We respect your intellectual property and privacy. Audio files are processed for analysis only and are not stored permanently on our servers, sold, or distributed to third parties. We do not sell or give away your email address, personal information, or usage statistics to anyone.
                        </p>
                    </div>
                </div>
            </div>

            <div className="border-t border-studio-600 pt-4 mt-6">
              <p className="text-sm text-studio-400 uppercase tracking-wider mb-2">Created By</p>
              <p className="font-bold text-white text-lg">Sela Mador-Haim</p>
              <p className="text-studio-accent font-medium mb-2">Artist Name: Lost Track</p>
              
              <div className="flex flex-col gap-2 mt-4">
                <a 
                  href="https://www.losttrackmusic.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm bg-studio-700 hover:bg-studio-600 text-white px-4 py-2 rounded-lg transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  www.losttrackmusic.com
                </a>
                 <a 
                  href="mailto:sela@losttrackmusic.com"
                  className="inline-flex items-center gap-2 text-sm bg-studio-700 hover:bg-studio-600 text-white px-4 py-2 rounded-lg transition"
                >
                  <Mail className="w-4 h-4" />
                  sela@losttrackmusic.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderInput = () => (
    <div className="max-w-2xl mx-auto bg-studio-800 p-8 rounded-2xl border border-studio-600 shadow-2xl">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">New Project Analysis</h2>
        <p className="text-studio-400">Upload your demo for forensic evaluation.</p>
        {!user && (
          <div className="mt-4 p-3 bg-studio-900/50 rounded-lg inline-block">
             <p className="text-sm text-studio-300">
               <button onClick={() => setShowAuth(true)} className="text-studio-accent hover:underline font-bold">Log in</button> to save your report history automatically.
             </p>
          </div>
        )}
      </div>
      
      <form onSubmit={handleAnalyze} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium text-studio-400 uppercase tracking-wider mb-1">Artist Name</label>
            <input
              type="text"
              name="artistName"
              required
              value={formData.artistName}
              onChange={handleInputChange}
              className="w-full bg-studio-900 border border-studio-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-studio-accent focus:outline-none transition"
              placeholder="e.g. The Midnight Echo"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-studio-400 uppercase tracking-wider mb-1">Song Name</label>
            <input
              type="text"
              name="songName"
              required
              value={formData.songName}
              onChange={handleInputChange}
              className="w-full bg-studio-900 border border-studio-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-studio-accent focus:outline-none transition"
              placeholder="e.g. Neon Dreams"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-studio-400 uppercase tracking-wider mb-1">AI Usage</label>
          <div className="grid grid-cols-3 gap-3">
            {Object.values(AIUsage).map((usage) => (
              <label key={usage} className={`
                cursor-pointer rounded-lg border px-3 py-3 text-sm font-medium text-center transition
                ${formData.aiUsage === usage 
                  ? 'bg-studio-accent/20 border-studio-accent text-white' 
                  : 'bg-studio-900 border-studio-600 text-studio-400 hover:border-studio-500'}
              `}>
                <input
                  type="radio"
                  name="aiUsage"
                  value={usage}
                  checked={formData.aiUsage === usage}
                  onChange={handleInputChange}
                  className="hidden"
                />
                {usage}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-studio-400 uppercase tracking-wider mb-1">Stated Intent</label>
          <textarea
            name="intent"
            required
            value={formData.intent}
            onChange={handleInputChange}
            rows={3}
            className="w-full bg-studio-900 border border-studio-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-studio-accent focus:outline-none transition"
            placeholder="What were you trying to achieve? (e.g., 'A summer club anthem with a dark twist')"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-studio-400 uppercase tracking-wider mb-1">Audio File (MP3/WAV)</label>
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-studio-600 rounded-lg p-8 text-center cursor-pointer hover:border-studio-accent hover:bg-studio-700/50 transition group"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="audio/*" 
              className="hidden" 
            />
            <div className="flex justify-center mb-4">
              {file ? (
                 <FileAudio className="w-12 h-12 text-studio-accent" />
              ) : (
                 <Upload className="w-12 h-12 text-studio-400 group-hover:text-studio-accent transition" />
              )}
            </div>
            <p className="text-sm text-gray-300 font-medium">
              {file ? file.name : "Click to upload or drag and drop"}
            </p>
            <p className="text-xs text-gray-500 mt-1">MP3 or WAV up to 10MB recommended</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 bg-red-900/20 p-3 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-studio-accent hover:bg-indigo-500 text-white font-bold py-4 rounded-lg shadow-lg shadow-indigo-900/50 transition transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Activity className="w-5 h-5" />
          Run Diagnostic
        </button>
      </form>
    </div>
  );

  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="relative w-24 h-24 mb-8">
        <div className="absolute inset-0 border-4 border-studio-600 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-t-studio-accent border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
        <Music className="absolute inset-0 m-auto w-8 h-8 text-white animate-pulse" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Deconstructing Audio...</h2>
      <div className="flex flex-col items-center space-y-1 text-studio-400 text-sm">
        <p className="animate-pulse">Extracting Lyrics...</p>
        <p className="animate-pulse delay-75">Analyzing Transient Response...</p>
        <p className="animate-pulse delay-150">Calculating Harmonic Complexity...</p>
      </div>
    </div>
  );

  const renderScoreCard = (item: ScoreItem, index: number) => (
    <div 
      key={index} 
      className={`
        bg-studio-800 rounded-lg border border-studio-600 break-inside-avoid h-full
        ${isPdfMode ? 'p-3' : 'p-4'}
      `}
    >
      <div className="flex justify-between items-center mb-1.5">
        <h4 className={`font-bold text-gray-200 uppercase tracking-wide pr-2 ${isPdfMode ? 'text-sm' : 'text-sm truncate'}`}>
          {item.criteria}
        </h4>
        <span className={`font-mono font-bold ${item.score >= 8 ? 'text-green-400' : item.score >= 5 ? 'text-yellow-400' : 'text-red-400'} ${isPdfMode ? 'text-base' : 'text-lg'}`}>
          {item.score}/10
        </span>
      </div>
      <div className="w-full bg-studio-900 h-1 rounded-full mb-2">
        <div 
          className={`h-1 rounded-full ${item.score >= 8 ? 'bg-green-500' : item.score >= 5 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${item.score * 10}%` }}
        ></div>
      </div>
      <p className={`text-gray-400 leading-snug ${isPdfMode ? 'text-[10px] leading-tight' : 'text-xs'}`}>
        {item.rationale}
      </p>
    </div>
  );

  const getImportanceColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    }
  };

  const renderReport = () => {
    if (!report) return null;

    return (
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        <div className="flex justify-between items-center">
          <button onClick={() => { setStep(Step.INPUT); setReport(null); }} className="text-sm text-studio-400 hover:text-white flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Input
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF}
            className="flex items-center gap-2 bg-studio-700 hover:bg-studio-600 text-white px-4 py-2 rounded-lg text-sm transition border border-studio-600 disabled:opacity-50"
          >
            {isGeneratingPDF ? (
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isGeneratingPDF ? 'Generating...' : 'Download PDF Report'}
          </button>
        </div>

        {/* Printable Area - Note the pdf-section classes added to main containers */}
        <div ref={reportRef} className="space-y-4 p-4 bg-studio-900 text-white">
          {/* Header - Compact */}
          <div className="pdf-section bg-studio-800 border border-studio-600 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="px-2 py-0.5 bg-studio-accent/20 text-studio-accent text-[10px] font-bold uppercase rounded tracking-wider">Report Generated</span>
                <span className="text-studio-500 text-xs font-mono">{new Date().toLocaleDateString()}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">{report.songName}</h1>
              <h2 className="text-lg text-studio-300 flex items-center gap-2 mb-1">
                <UserIcon className="w-4 h-4" /> {report.artistName}
              </h2>
              <div className="flex items-center gap-2">
                 <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                    formData.aiUsage === AIUsage.NONE ? 'bg-green-900/30 border-green-700 text-green-400' :
                    formData.aiUsage === AIUsage.ASSISTED ? 'bg-blue-900/30 border-blue-700 text-blue-400' :
                    'bg-purple-900/30 border-purple-700 text-purple-400'
                 }`}>
                    <Cpu className="w-3 h-3 inline mr-1" />
                    {formData.aiUsage}
                 </span>
              </div>
            </div>
            <div className="flex gap-3 text-center">
               <div className="bg-studio-900 px-4 py-2 rounded-lg border border-studio-700">
                  <p className="text-[10px] text-studio-500 uppercase tracking-wider">Est. Key</p>
                  <p className="text-lg font-mono font-bold text-white">{report.composition.key}</p>
               </div>
               <div className="bg-studio-900 px-4 py-2 rounded-lg border border-studio-700">
                  <p className="text-[10px] text-studio-500 uppercase tracking-wider">BPM</p>
                  <p className="text-lg font-mono font-bold text-white">{report.composition.bpm}</p>
               </div>
            </div>
          </div>

           {/* Executive Summary (Mini Review) - New Section */}
           <div className="pdf-section bg-studio-800 border border-studio-600 rounded-2xl p-5">
              <h3 className="text-md font-bold text-white mb-2 flex items-center gap-2 uppercase text-sm tracking-wider">
                  <Quote className="w-4 h-4 text-studio-accent" /> 
                  Producer's Executive Summary
              </h3>
              <p className={`text-gray-300 leading-relaxed italic ${isPdfMode ? 'text-[11px]' : 'text-sm'}`}>
                  "{report.miniReview}"
              </p>
          </div>

          <div className={`grid ${isPdfMode ? 'grid-cols-3 gap-4' : 'grid-cols-1 lg:grid-cols-3 gap-4'}`}>
              {/* Left Column: Scores */}
              <div className="col-span-2 space-y-4">
                  
                  {/* Radar & Overview */}
                  <div className="pdf-section bg-studio-800 border border-studio-600 rounded-2xl p-5">
                      <h3 className="text-md font-bold text-white mb-4 flex items-center gap-2 uppercase text-sm tracking-wider">
                          <Activity className="w-4 h-4 text-studio-accent" /> 
                          Performance Matrix
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                          <div className={`${isPdfMode ? 'h-[320px]' : 'h-[400px]'}`}>
                              <AnalysisRadarChart scores={report.scores} />
                          </div>
                          <div className="space-y-3">
                              <div className="bg-studio-900/50 p-3 rounded-xl">
                                  <p className="text-[10px] text-studio-400 uppercase mb-1">Market Positioning</p>
                                  <div className="flex flex-wrap gap-1">
                                      {report.marketPositioning.genreTags.map(tag => (
                                          <span key={tag} className={`px-2 py-0.5 rounded-md border border-studio-600 text-white bg-studio-700 ${isPdfMode ? 'text-[8px]' : 'text-[10px]'}`}>{tag}</span>
                                      ))}
                                  </div>
                              </div>
                              <div className="bg-studio-900/50 p-3 rounded-xl">
                                  <p className="text-[10px] text-studio-400 uppercase mb-1">Similar Artists</p>
                                  <p className={`${isPdfMode ? 'text-[8px]' : 'text-xs'} text-gray-300`}>{report.marketPositioning.similarArtists.join(", ")}</p>
                              </div>
                              <div className="bg-studio-900/50 p-3 rounded-xl border-l-2 border-studio-accent">
                                  <p className="text-[10px] text-studio-400 uppercase mb-1">Verdict</p>
                                  <p className={`${isPdfMode ? 'text-[9px]' : 'text-sm'} font-medium text-white italic`}>"{report.intentVsExecution.verdict}"</p>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Detailed Scores - Conditional Layout */}
                  <div className={`pdf-section grid ${isPdfMode ? 'grid-cols-2 gap-3' : 'grid-cols-1 md:grid-cols-2 gap-4'}`}>
                      {report.scores.map((score, i) => renderScoreCard(score, i))}
                  </div>
              </div>

              {/* Right Column: Technical & Lyrics */}
              <div className="space-y-4">
                   {/* Technical */}
                   <div className="pdf-section bg-studio-800 border border-studio-600 rounded-2xl p-5">
                      <h3 className="text-md font-bold text-white mb-3 flex items-center gap-2 uppercase text-sm tracking-wider">
                          <Zap className="w-4 h-4 text-yellow-500" /> 
                          Technical Breakdown
                      </h3>
                      <ul className="space-y-3 text-xs">
                          <li>
                              <span className="block text-[10px] text-studio-400 uppercase">Mix Balance</span>
                              <span className="text-gray-300">{report.technicalAnalysis.mixBalance}</span>
                          </li>
                          <li>
                              <span className="block text-[10px] text-studio-400 uppercase">Stereo Image</span>
                              <span className="text-gray-300">{report.technicalAnalysis.stereoImage}</span>
                          </li>
                           <li>
                              <span className="block text-[10px] text-studio-400 uppercase">Time to Chorus</span>
                              <span className="text-gray-300">{report.structure.timeToChorus}</span>
                          </li>
                      </ul>
                   </div>

                    {/* Lyrics Preview */}
                   <div className={`pdf-section bg-studio-800 border border-studio-600 rounded-2xl p-5 flex flex-col h-auto ${isPdfMode ? '' : 'min-h-[250px]'}`}>
                       <h3 className="text-md font-bold text-white mb-3 flex items-center gap-2 uppercase text-sm tracking-wider">
                          <Mic2 className="w-4 h-4 text-studio-accent" /> 
                          Lyrical Forensics
                      </h3>
                      <div className={`flex-1 pr-2 font-mono leading-tight whitespace-pre-wrap text-gray-400 ${isPdfMode ? 'text-[7px] columns-2 gap-6' : 'text-[10px] md:text-xs overflow-y-auto max-h-[400px]'}`}>
                          {report.lyrics}
                      </div>
                   </div>
              </div>
          </div>

          {/* Strategy & Improvement Section */}
          <div className={`grid ${isPdfMode ? 'grid-cols-2 gap-4' : 'grid-cols-1 md:grid-cols-2 gap-4'} break-before-page`}>
              {/* Improvements */}
              <div className="pdf-section bg-studio-800 border border-studio-600 rounded-2xl p-5">
                  <h3 className="text-md font-bold text-white mb-4 flex items-center gap-2 uppercase text-sm tracking-wider">
                      <Sliders className="w-4 h-4 text-blue-400" /> 
                      Optimization Goals
                  </h3>
                  <div className="space-y-4">
                      <div className="group">
                          <div className="flex justify-between items-center mb-1">
                             <p className="text-[10px] text-blue-400 uppercase tracking-wider group-hover:text-blue-300 transition">Production</p>
                             <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase ${getImportanceColor(report.improvementTips.production.importance)}`}>
                                {report.improvementTips.production.importance}
                             </span>
                          </div>
                          <p className={`text-gray-300 leading-relaxed ${isPdfMode ? 'text-[8px]' : 'text-xs'}`}>{report.improvementTips.production.suggestion}</p>
                      </div>
                      <div className="h-px bg-studio-700" />
                      <div className="group">
                           <div className="flex justify-between items-center mb-1">
                              <p className="text-[10px] text-blue-400 uppercase tracking-wider group-hover:text-blue-300 transition">Composition</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase ${getImportanceColor(report.improvementTips.composition.importance)}`}>
                                {report.improvementTips.composition.importance}
                             </span>
                          </div>
                          <p className={`text-gray-300 leading-relaxed ${isPdfMode ? 'text-[8px]' : 'text-xs'}`}>{report.improvementTips.composition.suggestion}</p>
                      </div>
                      <div className="h-px bg-studio-700" />
                      <div className="group">
                           <div className="flex justify-between items-center mb-1">
                              <p className="text-[10px] text-blue-400 uppercase tracking-wider group-hover:text-blue-300 transition">Performance</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase ${getImportanceColor(report.improvementTips.performance.importance)}`}>
                                {report.improvementTips.performance.importance}
                             </span>
                          </div>
                          <p className={`text-gray-300 leading-relaxed ${isPdfMode ? 'text-[8px]' : 'text-xs'}`}>{report.improvementTips.performance.suggestion}</p>
                      </div>
                  </div>
              </div>

              {/* Marketing & Launch */}
              <div className="pdf-section bg-studio-800 border border-studio-600 rounded-2xl p-5">
                   <h3 className="text-md font-bold text-white mb-4 flex items-center gap-2 uppercase text-sm tracking-wider">
                      <TrendingUp className="w-4 h-4 text-green-400" /> 
                      Strategic Roadmap
                  </h3>
                  <div className="space-y-4">
                      <div>
                          <p className="flex items-center gap-2 text-[10px] text-studio-400 uppercase tracking-wider mb-2">
                              <Share2 className="w-3 h-3" /> Social & Distribution
                          </p>
                          <ul className={`list-disc list-inside text-gray-300 space-y-1 marker:text-studio-600 ${isPdfMode ? 'text-[8px]' : 'text-xs'}`}>
                              {report.marketingSuggestions.socialStrategy.slice(0,2).map((s, i) => <li key={i}>{s}</li>)}
                              {report.marketingSuggestions.streamingStrategy.slice(0,2).map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                      </div>
                      
                      <div>
                           <p className="flex items-center gap-2 text-[10px] text-studio-400 uppercase tracking-wider mb-2">
                              <Target className="w-3 h-3" /> Target Labels
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {report.marketingSuggestions.targetLabels.map((labelGroup, idx) => (
                                  <div key={idx} className="bg-studio-900/50 p-2 rounded-lg border border-studio-700">
                                      <p className="text-[10px] text-green-400 font-bold uppercase mb-0.5">{labelGroup.type}</p>
                                      <p className={`font-bold text-white mb-0.5 ${isPdfMode ? 'text-[9px]' : 'text-xs truncate'}`}>{labelGroup.names.join(", ")}</p>
                                      <p className={`text-[10px] text-gray-500 leading-tight ${isPdfMode ? '' : 'line-clamp-2'}`}>{labelGroup.reason}</p>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
        </div>

        {/* Call to Action for Step 2 */}
        {step === Step.REPORT && (
             <div className="flex justify-center pt-8 pb-20">
                <button 
                    onClick={handleConvenedPanel}
                    className="bg-white text-studio-900 hover:bg-gray-100 px-8 py-4 rounded-full font-bold text-lg shadow-[0_0_20px_rgba(255,255,255,0.3)] transition transform hover:scale-105 flex items-center gap-3"
                >
                    <UserIcon className="w-6 h-6" />
                    Convene Producer Panel
                </button>
             </div>
        )}
      </div>
    );
  };

  const renderPanel = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-studio-900 border-t border-studio-600 shadow-2xl transition-all duration-500 h-[60vh] flex flex-col z-50">
        <div className="bg-studio-800 p-4 flex justify-between items-center border-b border-studio-700">
            <h3 className="font-bold text-white flex items-center gap-2">
                <div className="flex -space-x-2">
                    {[1,2,3,4].map(i => (
                        <div key={i} className="w-8 h-8 rounded-full bg-studio-600 border-2 border-studio-800 flex items-center justify-center text-xs text-white font-bold">
                            {['H','A','N','R'][i-1]}
                        </div>
                    ))}
                </div>
                Producer Panel In Session
            </h3>
            <button onClick={() => setStep(Step.REPORT)} className="text-xs text-studio-400 hover:text-white uppercase">Close Panel</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4 font-mono text-sm bg-studio-900/95">
            {panelTranscript.split('\n').map((line, i) => {
                if (!line.trim()) return null;
                const isSpeaker = line.includes(':');
                const [speaker, ...rest] = line.split(':');
                
                if (!isSpeaker) return <div key={i} className="text-gray-400 pl-4">{line}</div>

                let colorClass = "text-gray-200";
                if (speaker.toUpperCase().includes("HIT-SEEKER")) colorClass = "text-purple-400";
                if (speaker.toUpperCase().includes("ARTISTE")) colorClass = "text-pink-400";
                if (speaker.toUpperCase().includes("NICHE")) colorClass = "text-green-400";
                if (speaker.toUpperCase().includes("RUTHLESS")) colorClass = "text-red-500";

                return (
                    <div key={i} className="mb-4">
                        <span className={`font-bold ${colorClass} mr-2 block md:inline`}>{speaker}:</span>
                        <span className="text-gray-300">{rest.join(':')}</span>
                    </div>
                )
            })}
            <div ref={chatEndRef} />
            {isStreamingPanel && (
                <div className="flex items-center gap-2 text-studio-500 mt-4">
                    <div className="w-2 h-2 bg-studio-accent rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-studio-accent rounded-full animate-bounce delay-75"></div>
                    <div className="w-2 h-2 bg-studio-accent rounded-full animate-bounce delay-150"></div>
                </div>
            )}
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-studio-900 font-sans text-gray-200 pb-24">
        {/* Sticky Nav */}
        <nav className="sticky top-0 z-40 bg-studio-900/80 backdrop-blur-lg border-b border-studio-800 px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-studio-accent rounded flex items-center justify-center">
                    <Award className="text-white w-5 h-5" />
                </div>
                <span className="font-bold text-xl tracking-tight text-white">SongRater.ai</span>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <>
                   <button onClick={() => setShowHistory(true)} className="text-sm text-studio-400 hover:text-white transition flex items-center gap-1">
                      <History className="w-4 h-4" />
                      <span className="hidden md:inline">History</span>
                   </button>
                   <button onClick={handleLogout} className="text-sm text-studio-400 hover:text-white transition flex items-center gap-1">
                      <LogOut className="w-4 h-4" />
                      <span className="hidden md:inline">Logout</span>
                   </button>
                </>
              ) : (
                <button onClick={() => setShowAuth(true)} className="text-sm text-studio-accent hover:text-white transition font-medium">
                   Log In
                </button>
              )}
              
              <button onClick={() => setShowAbout(true)} className="text-sm text-studio-400 hover:text-white transition flex items-center gap-1">
                  <Info className="w-4 h-4" />
                  <span className="hidden md:inline">About</span>
              </button>
              {step !== Step.INPUT && (
                  <button onClick={() => { setStep(Step.INPUT); setReport(null); setFile(null); setPanelTranscript(''); }} className="text-sm bg-studio-800 hover:bg-studio-700 px-3 py-1.5 rounded-md border border-studio-600 text-white transition">
                      New Analysis
                  </button>
              )}
            </div>
        </nav>

        <main className="container mx-auto px-4 py-8">
            {step === Step.INPUT && renderInput()}
            {step === Step.ANALYZING && renderLoading()}
            {(step === Step.REPORT || step === Step.DISCUSSING || step === Step.FULL_VIEW) && renderReport()}
        </main>

        {(step === Step.DISCUSSING || step === Step.FULL_VIEW) && renderPanel()}
        
        {renderAboutModal()}
        {renderAuthModal()}
        {renderHistoryModal()}
    </div>
  );
}

export default App;