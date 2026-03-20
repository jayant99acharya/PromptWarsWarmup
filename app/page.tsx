"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success', message: string, reasoning?: string } | null>(null);
  const [leaderboard, setLeaderboard] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      if (data.success && data.leaderboard) {
        setLeaderboard(data.leaderboard);
      }
    } catch (e) {
      console.error("Failed to fetch leaderboard", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    setLoading(true);
    setStatus(null);
    
    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus({ 
          type: 'success', 
          message: `Valid submission! You scored ${data.score} points.`,
          reasoning: data.reasoning 
        });
        if (data.leaderboard) {
          setLeaderboard(data.leaderboard);
        } else {
          fetchLeaderboard();
        }
        setUrl('');
      } else {
        setStatus({ type: 'error', message: data.error || 'Validation failed.' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'An error occurred during validation.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <h1>Hackathon Validator</h1>
      <p className="subtitle">Submit your public GitHub repository (≤ 3 commits) to see your score.</p>
      
      <div className="glass-panel">
        <form onSubmit={handleSubmit} className="form-group">
          <input 
            type="url" 
            placeholder="https://github.com/username/repo" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            required
            spellCheck="false"
          />
          <button type="submit" disabled={loading || !url}>
            {loading ? 'Validating...' : 'Validate & Submit'}
          </button>
        </form>
        
        {status && (
          <div className={`status-message status-${status.type}`}>
            <p>{status.message}</p>
            {status.reasoning && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.9rem', fontStyle: 'italic', borderLeft: '3px solid var(--accent-color)' }}>
                <strong>AI Reasoning:</strong> {status.reasoning}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="leaderboard-container">
        <div className="leaderboard-header">
          <h2>Leaderboard</h2>
        </div>
        
        {Object.keys(leaderboard).length > 0 ? (
          <div className="leaderboard-list">
            {Object.entries(leaderboard).map(([repoUrl, score], index) => {
              const rankClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
              return (
                <div key={repoUrl} className={`leaderboard-item ${rankClass}`}>
                  <div className="rank-repo">
                    <span className="rank">#{index + 1}</span>
                    <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="repo-link">
                      {repoUrl.replace('https://github.com/', '')}
                    </a>
                  </div>
                  <span className="score">{score} pts</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-panel" style={{ textAlign: 'center', opacity: 0.7 }}>
            No submissions yet. Be the first!
          </div>
        )}
      </div>
    </main>
  );
}
