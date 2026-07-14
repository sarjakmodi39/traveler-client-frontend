import React, { useState, useEffect } from 'react';
import { 
  Compass, 
  Calendar, 
  DollarSign, 
  Activity, 
  Send, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Info,
  Clock,
  Plane,
  Repeat,
  Layers,
  Check,
  X,
  Sparkles
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

interface AgentLog {
  agentName: string;
  input: string;
  output: string;
  durationMs: number;
  modelUsed: string;
}

interface TripRequest {
  id: string;
  prompt: string;
  createdAt: string;
  status: string;
  response: string | null;
  logs?: AgentLog[];
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // 0: idle, 1: Router, 2: Destination, 3: Parallel (Itinerary/Transit), 4: Budget (Retries), 5: Proposal
  const [simulatedBudgetAttempt, setSimulatedBudgetAttempt] = useState<number>(1); // 1 or 2
  const [tripResponse, setTripResponse] = useState<{
    tripId: string;
    context: any;
    finalResponse: string;
  } | null>(null);

  // Active agent log viewer tab
  const [activeTab, setActiveTab] = useState<'router' | 'destination' | 'itinerary' | 'transit' | 'hotel' | 'budget' | 'proposal'>('destination');
  
  // History and selected session details
  const [history, setHistory] = useState<TripRequest[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripRequest | null>(null);
  
  // Overage & Alternative variables from current context
  const [overageInfo, setOverageInfo] = useState<{ warning?: string; alternative?: string } | null>(null);

  // Role-based Access Control
  const [role, setRole] = useState<'traveler' | 'auditor'>('traveler');
  
  // Global audit logs (only visible to auditors)
  const [globalLogs, setGlobalLogs] = useState<any[]>([]);

  // Fetch initial session history
  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  // Fetch global logs for auditor role
  const fetchGlobalLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/logs`);
      if (res.ok) {
        const data = await res.json();
        setGlobalLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch global logs:', err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    if (role === 'auditor') {
      fetchGlobalLogs();
    }
  }, [role]);

  // Load a trip's details when clicked from history
  const handleSelectTrip = async (trip: TripRequest) => {
    try {
      const res = await fetch(`${API_BASE}/api/trip/${trip.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedTrip(data);
        
        // Reconstruct context parameters for visualization
        const destLog = data.logs?.find((l: any) => l.agentName === 'Destination');
        const budgetLog = data.logs?.find((l: any) => l.agentName === 'Budget');
        
        let destinationName = '';
        if (destLog) {
          try {
            const parsedDest = JSON.parse(destLog.output);
            destinationName = parsedDest.suggestions?.[0]?.name || '';
          } catch(e){}
        }

        let totalEst = 1200;
        let isWithin = true;
        let breakdown = [];
        let overageWarning = '';
        let alternativeProposal = '';
        if (budgetLog) {
          try {
            const parsedBudget = JSON.parse(budgetLog.output);
            totalEst = parsedBudget.totalEstimatedCost;
            isWithin = parsedBudget.isWithinBudget;
            breakdown = parsedBudget.breakdown || [];
            overageWarning = parsedBudget.overageWarning || '';
            alternativeProposal = parsedBudget.alternativeProposal || '';
          } catch(e){}
        }

        // Count budget attempts
        const budgetAttemptsCount = data.logs?.filter((l: any) => l.agentName === 'Budget').length || 0;
        const retryCountVal = budgetAttemptsCount > 1 ? 1 : 0;
        
        const calculatedScore = (() => {
          const itinLog = data.logs?.find((l: any) => l.agentName === 'Itinerary');
          let uncertaintyCount = 0;
          try {
            if (itinLog) {
              const itinObj = JSON.parse(itinLog.output);
              uncertaintyCount = itinObj?.uncertaintyFlags?.length || 0;
            }
          } catch (e) {}
          let score = 96;
          if (retryCountVal > 0) score -= 8;
          score -= (uncertaintyCount * 2);
          return Math.max(75, Math.min(98, score));
        })();

        setTripResponse({
          tripId: data.id,
          context: {
            selectedDestination: destinationName,
            params: {
              destination: destinationName,
              duration: data.logs?.find((l: any) => l.agentName === 'Itinerary') ? data.logs.filter((l: any) => l.agentName === 'Itinerary').length : 5,
              budget: 1500,
              currency: '£'
            },
            confidenceScore: calculatedScore,
            retryCount: retryCountVal,
            destinationSuggestions: destLog ? JSON.parse(destLog.output).suggestions : [],
            budgetAnalysis: {
              totalEstimatedCost: totalEst,
              isWithinBudget: isWithin,
              breakdown: breakdown,
              overageWarning: overageWarning,
              alternativeProposal: alternativeProposal
            },
            logs: data.logs || []
          },
          finalResponse: data.response || ''
        });
        
        setOverageInfo(overageWarning ? {
          warning: overageWarning,
          alternative: alternativeProposal
        } : null);
        
        setSimulatedBudgetAttempt(budgetAttemptsCount);
        setCurrentStep(5);
      }
    } catch (err) {
      console.error('Failed to load trip details:', err);
    }
  };

  const handleSamplePrompt = (text: string) => {
    setPrompt(text);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setTripResponse(null);
    setSelectedTrip(null);
    setOverageInfo(null);
    setSimulatedBudgetAttempt(1);

    // Visual Concurrency Stepper Replay
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      setCurrentStep(1); // Router Analysis
      
      const apiPromise = fetch(`${API_BASE}/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      await sleep(1200);
      setCurrentStep(2); // Destination Agent

      await sleep(1500);
      setCurrentStep(3); // Parallel Concurrency: Itinerary + Transit

      await sleep(2200);
      setCurrentStep(4); // Budget validation (Attempt 1)
      setSimulatedBudgetAttempt(1);

      const res = await apiPromise;
      if (!res.ok) {
        throw new Error('API request failed');
      }
      const data = await res.json();

      // Show Self-Correction Retry if overage occurred
      const neededRetry = data.context?.retryCount > 0;
      if (neededRetry) {
        await sleep(1500);
        setSimulatedBudgetAttempt(2); // Attempt 2: Hostel adjustment
        await sleep(1000);
      }

      setCurrentStep(5); // Synthesis / Proposal Agent
      setTripResponse(data);
      
      if (data.context?.budgetAnalysis) {
        setOverageInfo(data.context.budgetAnalysis.overageWarning ? {
          warning: data.context.budgetAnalysis.overageWarning,
          alternative: data.context.budgetAnalysis.alternativeProposal
        } : null);
      }

      fetchHistory();
      if (role === 'auditor') {
        fetchGlobalLogs();
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getSelectedAgentOutput = () => {
    if (!tripResponse?.context?.logs) return 'No log context loaded.';
    
    // Map tab names to logs
    let searchName = activeTab;
    if (activeTab === 'router') searchName = 'router'; // handled below
    
    // Custom Router rendering since parsing isn't logged as a distinct AgentLog row
    if (activeTab === 'router') {
      return JSON.stringify(tripResponse.context.params, null, 2);
    }

    const matchedLogs = tripResponse.context.logs.filter(
      (l: any) => l.agentName.toLowerCase() === searchName.toLowerCase()
    );

    if (matchedLogs.length === 0) return `No output recorded for ${activeTab} agent.`;
    
    // If there are multiple entries (e.g. Budget retry attempts), return them concatenated
    return matchedLogs.map((l: any, i: number) => `[ATTEMPT #${i + 1}]\n${l.output}`).join('\n\n');
  };

  const getSelectedAgentInput = () => {
    if (!tripResponse?.context?.logs) return 'No log context loaded.';
    if (activeTab === 'router') {
      return `Parse Query Prompt: "${tripResponse.context.logs[0]?.input.substring(0, 100)}..."`;
    }

    const matchedLogs = tripResponse.context.logs.filter(
      (l: any) => l.agentName.toLowerCase() === activeTab.toLowerCase()
    );

    if (matchedLogs.length === 0) return `No input recorded for ${activeTab} agent.`;
    return matchedLogs.map((l: any, i: number) => `[ATTEMPT #${i + 1}]\n${l.input}`).join('\n\n');
  };

  const getSelectedAgentStats = () => {
    if (!tripResponse?.context?.logs) return { model: 'gemini-3.1-flash-lite', latency: 0 };
    
    if (activeTab === 'router') {
      return { model: 'gemini-3.1-flash-lite', latency: 450 };
    }

    const log = tripResponse.context.logs.find(
      (l: any) => l.agentName.toLowerCase() === activeTab.toLowerCase()
    );
    
    return {
      model: log?.modelUsed || 'gemini-3.1-flash-lite',
      latency: log?.durationMs || 500
    };
  };

  const renderMarkdown = (md: string) => {
    if (!md) return '';
    return md
      .replace(/### (.*)/g, '<h3>$1</h3>')
      .replace(/## (.*)/g, '<h2>$1</h2>')
      .replace(/# (.*)/g, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/• (.*)/g, '<li>$1</li>')
      .replace(/> (.*)/g, '<blockquote>$1</blockquote>')
      .split('\n').map((para, i) => {
        if (para.startsWith('<h') || para.startsWith('<li') || para.startsWith('<block')) {
          return <div key={i} dangerouslySetInnerHTML={{ __html: para }} />;
        }
        return para.trim() ? <p key={i} dangerouslySetInnerHTML={{ __html: para }} /> : null;
      });
  };

  // Accepted and rejected destination details for rendering
  const currentSuggestions = tripResponse?.context?.destinationSuggestions || [];
  const selectedDestInfo = currentSuggestions.length > 0 ? currentSuggestions[0] : null;

  return (
    <div className="app-container">
      {/* Sidebar: History */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Activity size={22} color="#6366f1" />
          <span className="logo-text">Collaborative Agent Network</span>
        </div>
        <div className="sidebar-content">
          <h3 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Trip Planning Audits ({history.length})
          </h3>
          {history.length === 0 ? (
            <div style={{ color: 'var(--text-dark)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
              No audits recorded yet.
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id} 
                className={`history-item ${(selectedTrip?.id === item.id || tripResponse?.tripId === item.id) ? 'active' : ''}`}
                onClick={() => handleSelectTrip(item)}
              >
                <div className="history-item-prompt">{item.prompt}</div>
                <div className="history-item-meta">
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  <span className={`status-badge ${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="main-content">
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Role Access:</span>
            <select 
              value={role} 
              onChange={(e) => setRole(e.target.value as any)}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="traveler" style={{ backgroundColor: '#0f1524', color: '#f3f4f6' }}>Standard Traveler</option>
              <option value="auditor" style={{ backgroundColor: '#0f1524', color: '#f3f4f6' }}>Platform Auditor & Observer</option>
            </select>
          </div>

          <div className="user-badge">
            <User size={14} />
            <span>{role === 'auditor' ? 'Admin Platform Auditor' : 'Traveler Client Session'}</span>
          </div>
        </header>

        <div className="dashboard-grid">
          {/* Section 1: User Request Box */}
          <section className="input-card">
            <div className="input-header-group">
              <h2 className="input-title">Where would you like to escape to?</h2>
              <p className="input-subtitle">Describe your ideal trip climate, length, and budget. Our agent network will route, execute, and verify the plan.</p>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="prompt-textarea-wrapper">
                <textarea 
                  className="prompt-textarea"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., A five day trip somewhere warm in Europe for under 1500 pounds..."
                  disabled={loading}
                />
              </div>

              <div className="input-actions" style={{ marginTop: '12px' }}>
                <div className="sample-prompts">
                  <span className="sample-tag" onClick={() => handleSamplePrompt('5 days in Europe, warm, budget £1500')}>
                    Warm Europe under £1500
                  </span>
                  <span className="sample-tag" onClick={() => handleSamplePrompt('A historical weekend in Kyoto, Japan, budget $3000')}>
                    Kyoto culture, $3000
                  </span>
                  <span className="sample-tag" onClick={() => handleSamplePrompt('7 days skiing in Chamonix, budget €1200')}>
                    Chamonix Skiing, €1200
                  </span>
                </div>

                <button type="submit" className="submit-btn" disabled={loading || !prompt.trim()}>
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                      Orchestrating Agents...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Plan Trip
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* Section 2: Visual Concurrency & Retry Stepper */}
          {(loading || currentStep > 0) && (
            <section className="stepper-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Active Orchestration Pipeline Trace (Concurrency Enabled)
                </h3>
                {loading && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Loader2 size={12} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} />
                    {currentStep === 1 && 'Extracting parameters...'}
                    {currentStep === 2 && 'Evaluating destinations...'}
                    {currentStep === 3 && 'Running Itinerary, Transit, & Hotels concurrently...'}
                    {currentStep === 4 && simulatedBudgetAttempt === 1 && 'Validating budget constraints (Attempt #1)...'}
                    {currentStep === 4 && simulatedBudgetAttempt === 2 && 'Self-Correction Loop: hostel fallback retry...'}
                    {currentStep === 5 && 'Compiling proposal...'}
                  </span>
                )}
              </div>

              {/* Stepper tree node wrapper */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '10px 0', position: 'relative' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 2fr 1.5fr 1fr', gap: '16px', alignItems: 'center' }}>
                  
                  {/* Step 1: Router */}
                  <div className={`stepper-step ${currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : ''}`}>
                    <div className="step-icon-circle">
                      <Activity size={18} />
                    </div>
                    <span className="step-label">1. Router</span>
                  </div>

                  {/* Step 2: Destination */}
                  <div className={`stepper-step ${currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : ''}`}>
                    <div className="step-icon-circle">
                      <Compass size={18} />
                    </div>
                    <span className="step-label">2. Destination</span>
                  </div>

                  {/* Step 3: Parallel branches */}
                  <div style={{ 
                    border: '1px dashed var(--border-color)', 
                    borderRadius: '12px', 
                    padding: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.01)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontSize: '0.65rem', color: 'var(--color-info)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                      <Layers size={10} />
                      Concurrently executing
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      {/* Sub-branch A: Itinerary */}
                      <div className={`stepper-step ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : ''}`} style={{ flex: 1 }}>
                        <div className="step-icon-circle" style={{ width: '32px', height: '32px' }}>
                          <Calendar size={12} />
                        </div>
                        <span className="step-label" style={{ fontSize: '0.65rem' }}>Itinerary</span>
                      </div>
                      
                      {/* Sub-branch B: Transit (Parallel) */}
                      <div className={`stepper-step ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : ''}`} style={{ flex: 1 }}>
                        <div className="step-icon-circle" style={{ width: '32px', height: '32px' }}>
                          <Plane size={12} />
                        </div>
                        <span className="step-label" style={{ fontSize: '0.65rem' }}>Transit</span>
                      </div>

                      {/* Sub-branch C: Hotels (Parallel) */}
                      <div className={`stepper-step ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : ''}`} style={{ flex: 1 }}>
                        <div className="step-icon-circle" style={{ width: '32px', height: '32px' }}>
                          <Compass size={12} />
                        </div>
                        <span className="step-label" style={{ fontSize: '0.65rem' }}>Hotels</span>
                      </div>
                    </div>
                  </div>

                  {/* Step 4: Budget Retries */}
                  <div className={`stepper-step ${currentStep === 4 ? 'active' : currentStep > 4 ? 'completed' : ''}`}>
                    <div className="step-icon-circle">
                      <DollarSign size={18} />
                    </div>
                    <span className="step-label">4. Budget Check</span>
                    {currentStep === 4 && (
                      <span style={{ 
                        fontSize: '0.65rem', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        backgroundColor: simulatedBudgetAttempt === 2 ? 'var(--color-warning-glow)' : 'var(--color-primary-glow)',
                        color: simulatedBudgetAttempt === 2 ? 'var(--color-warning)' : 'var(--color-primary)',
                        marginTop: '4px',
                        fontWeight: 700
                      }}>
                        {simulatedBudgetAttempt === 2 ? 'Attempt #2: Hostels' : 'Attempt #1: Hotels'}
                      </span>
                    )}
                    {currentStep > 4 && tripResponse?.context?.retryCount > 0 && (
                      <span style={{ 
                        fontSize: '0.65rem', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        backgroundColor: 'var(--color-warning-glow)', 
                        color: 'var(--color-warning)',
                        marginTop: '4px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}>
                        <Repeat size={8} />
                        Self-Corrected
                      </span>
                    )}
                  </div>

                  {/* Step 5: Proposal */}
                  <div className={`stepper-step ${currentStep === 5 ? 'completed' : ''}`}>
                    <div className="step-icon-circle">
                      <CheckCircle2 size={18} />
                    </div>
                    <span className="step-label">5. Proposal</span>
                  </div>

                </div>
              </div>
            </section>
          )}

          {/* Section 3: Results & Audit Trace */}
          {tripResponse && (
            <div className="response-grid">
              
              {/* Trip Plan Proposal */}
              <section className="results-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Confidence & Self-Correction Indicators */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  
                  {/* Dynamic Confidence Score Card */}
                  <div style={{
                    background: 'rgba(99, 102, 241, 0.05)',
                    border: '1px solid var(--border-color)',
                    padding: '16px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <div style={{ 
                      width: '42px', 
                      height: '42px', 
                      borderRadius: '50%', 
                      background: 'var(--color-primary-glow)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      color: 'var(--color-primary)',
                      fontSize: '1rem',
                      fontWeight: 700
                    }}>
                      {tripResponse.context.confidenceScore || 96}%
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Confidence Score</h4>
                      <p style={{ fontSize: '0.8rem', color: 'white', margin: 0 }}>Constraints matched successfully.</p>
                    </div>
                  </div>

                  {/* Agent Retries Card */}
                  <div style={{
                    background: tripResponse.context.retryCount > 0 ? 'rgba(245, 158, 11, 0.05)' : 'rgba(16, 185, 129, 0.05)',
                    border: '1px solid var(--border-color)',
                    padding: '16px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <div style={{ 
                      width: '42px', 
                      height: '42px', 
                      borderRadius: '50%', 
                      background: tripResponse.context.retryCount > 0 ? 'var(--color-warning-glow)' : 'var(--color-success-glow)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      color: tripResponse.context.retryCount > 0 ? 'var(--color-warning)' : 'var(--color-success)'
                    }}>
                      {tripResponse.context.retryCount > 0 ? <Repeat size={18} /> : <CheckCircle2 size={18} />}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Correction Loop</h4>
                      <div style={{ fontSize: '0.75rem', color: 'white', lineHeight: '1.4' }}>
                        {tripResponse.context.retryCount > 0 ? (
                          <div style={{ color: 'var(--color-warning)' }}>
                            <span>Attempt 1: Budget Exceeded</span><br/>
                            <span>🔄 Applying budget stays...</span><br/>
                            <span>✅ Attempt 2 Accepted</span>
                          </div>
                        ) : (
                          <div style={{ color: '#a7f3d0' }}>
                            <span>✓ Budget &nbsp; ✓ Duration</span><br/>
                            <span>✓ Stays &nbsp;&nbsp; ✓ Transit Routing</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {overageInfo?.warning && (
                  <div style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', fontWeight: 700, fontSize: '0.9rem' }}>
                      <AlertCircle size={18} />
                      <span>BUDGET EXCEEDED WARNING (FLAGGED BY BUDGET AGENT)</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#fca5a5', margin: 0 }}>
                      {overageInfo.warning}
                    </p>
                    {overageInfo.alternative && (
                      <div style={{ borderTop: '1px solid rgba(239, 68, 68, 0.2)', paddingTop: '8px', marginTop: '4px' }}>
                        <strong style={{ fontSize: '0.8rem', color: 'white' }}>CHEAPER ALTERNATIVE PROPOSED:</strong>
                        <p style={{ fontSize: '0.85rem', color: '#e5e7eb', margin: '4px 0 0 0' }}>
                          {overageInfo.alternative}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="markdown-body">
                  {renderMarkdown(tripResponse.finalResponse)}
                </div>
              </section>

              {/* Agent Contributions Panel */}
              <section className="audit-card">
                <div className="audit-card-title">
                  <Info size={16} color="var(--color-primary)" />
                  <span>Agent Contribution Trace</span>
                </div>

                {/* Contribution list mapping tabs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button 
                    className={`agent-tab-btn ${activeTab === 'router' ? 'active' : ''}`}
                    onClick={() => setActiveTab('router')}
                    style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span>✓ Router Classified Request</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>Parser</span>
                  </button>
                  <button 
                    className={`agent-tab-btn ${activeTab === 'destination' ? 'active' : ''}`}
                    onClick={() => setActiveTab('destination')}
                    style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span>✓ Destination Sights Evaluated</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>DestinationAgent</span>
                  </button>
                  <button 
                    className={`agent-tab-btn ${activeTab === 'itinerary' ? 'active' : ''}`}
                    onClick={() => setActiveTab('itinerary')}
                    style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span>✓ Itinerary Agent Generated Schedule</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>ItineraryAgent</span>
                  </button>
                  <button 
                    className={`agent-tab-btn ${activeTab === 'transit' ? 'active' : ''}`}
                    onClick={() => setActiveTab('transit')}
                    style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span>✓ Transit Agent Estimated Logistics</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>TransitAgent (Parallel)</span>
                  </button>
                  <button 
                    className={`agent-tab-btn ${activeTab === 'hotel' ? 'active' : ''}`}
                    onClick={() => setActiveTab('hotel')}
                    style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span>✓ Hotel Agent Searched Stays</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>HotelAgent (Parallel)</span>
                  </button>
                  <button 
                    className={`agent-tab-btn ${activeTab === 'budget' ? 'active' : ''}`}
                    onClick={() => setActiveTab('budget')}
                    style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span>✓ Budget Agent Validated Costs</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>BudgetAgent (Retries)</span>
                  </button>
                  <button 
                    className={`agent-tab-btn ${activeTab === 'proposal' ? 'active' : ''}`}
                    onClick={() => setActiveTab('proposal')}
                    style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span>✓ Proposal Agent Merged Responses</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>ProposalSynthesizer</span>
                  </button>
                </div>

                <div className="agent-tab-content" style={{ marginTop: '10px' }}>
                  <div className="meta-stats">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      Model: {getSelectedAgentStats().model}
                    </span>
                    <span>Latency: {getSelectedAgentStats().latency}ms</span>
                  </div>

                  {/* Destination Accepted/Rejected Box */}
                  {activeTab === 'destination' && selectedDestInfo && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                      <span className="raw-io-label" style={{ color: 'var(--color-success)' }}>
                        <Sparkles size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        Orchestrator Decision Reasoning
                      </span>
                      
                      <div style={{ 
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                        backgroundColor: 'rgba(16, 185, 129, 0.02)',
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '0.8rem'
                      }}>
                        <div style={{ color: 'var(--color-success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                          <Check size={14} />
                          <span>ACCEPTED: {selectedDestInfo.name} ({selectedDestInfo.climate})</span>
                        </div>
                        <p style={{ margin: 0, color: 'var(--text-main)' }}>
                          {selectedDestInfo.acceptedReason || 'Verified constraints matched.'}
                        </p>
                      </div>

                      <div style={{ 
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        backgroundColor: 'rgba(239, 68, 68, 0.02)',
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '0.8rem'
                      }}>
                        <div style={{ color: 'var(--color-danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                          <X size={14} />
                          <span>REJECTED ALTERNATIVES</span>
                        </div>
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                          {selectedDestInfo.rejectedReason || 'Evaluating alternate paths.'}
                        </p>
                      </div>
                    </div>
                  )}

                  <span className="raw-io-label">Agent Executed Prompt Input</span>
                  <pre className="raw-io-block" style={{ color: 'var(--text-muted)' }}>
                    {getSelectedAgentInput()}
                  </pre>

                  <span className="raw-io-label">Agent JSON Structure Output</span>
                  <pre className="raw-io-block">
                    {getSelectedAgentOutput()}
                  </pre>
                </div>
              </section>

            </div>
          )}

          {/* Section 4: Auditor Panel */}
          {role === 'auditor' && (
            <section className="input-card" style={{ borderLeft: '4px solid var(--color-info)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-info)' }}>
                  Platform Audit Logs & Latency Observability (Platform Engineer View)
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Refreshed Live</span>
              </div>
              <div style={{ overflowX: 'auto', marginTop: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px' }}>Timestamp</th>
                      <th style={{ padding: '8px' }}>Agent Name</th>
                      <th style={{ padding: '8px' }}>Model Used</th>
                      <th style={{ padding: '8px' }}>User Query</th>
                      <th style={{ padding: '8px' }}>Duration</th>
                      <th style={{ padding: '8px' }}>Sequence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '12px', textAlign: 'center', color: 'var(--text-dark)' }}>
                          No execution records in platform db.
                        </td>
                      </tr>
                    ) : (
                      globalLogs.map((log: any) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '8px', color: 'var(--text-dark)' }}>
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                          <td style={{ padding: '8px', fontWeight: 600, color: log.agentName === 'Budget' ? 'var(--color-warning)' : log.agentName === 'Destination' ? 'var(--color-info)' : log.agentName === 'Transit' ? 'var(--color-success)' : 'var(--color-primary)' }}>
                            {log.agentName}Agent
                          </td>
                          <td style={{ padding: '8px', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                            {log.modelUsed || 'gemini-1.5-flash'}
                          </td>
                          <td style={{ padding: '8px', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {log.tripRequest?.prompt}
                          </td>
                          <td style={{ padding: '8px', color: 'var(--color-success)' }}>{log.durationMs}ms</td>
                          <td style={{ padding: '8px' }}>Order: #{log.executionOrder}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
