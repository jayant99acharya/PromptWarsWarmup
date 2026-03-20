import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';

// Helper to parse github url
function parseGithubUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') return null;
    const parts = parsed.pathname.replace(/^\/|\/$/g, '').split('/');
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
    return null;
  } catch {
    return null;
  }
}

async function updateLeaderboard(url: string, score: number) {
  const filePath = path.join(process.cwd(), 'leaderboard.json');
  let leaderboard: Record<string, number> = {};
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    leaderboard = JSON.parse(data);
  } catch (error) {
    // File doesn't exist or invalid JSON, start fresh
  }
  
  leaderboard[url] = score;
  
  // Sort leaderboard descending
  const sortedArr = Object.entries(leaderboard).sort((a, b) => b[1] - a[1]);
  const sortedLeaderboard = Object.fromEntries(sortedArr);
  
  await fs.writeFile(filePath, JSON.stringify(sortedLeaderboard, null, 2));
  return sortedLeaderboard;
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
    }
    
    const parsed = parseGithubUrl(url);
    if (!parsed) {
      return NextResponse.json({ success: false, error: 'Invalid GitHub URL' }, { status: 400 });
    }
    
    const { owner, repo } = parsed;
    
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Hackathon-Validator',
    };
    
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }
    
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const response = await fetch(apiUrl, { headers });
    
    if (response.status === 404) {
      return NextResponse.json({ success: false, error: 'Repository not found or private.' }, { status: 404 });
    }
    if (response.status === 403) {
      return NextResponse.json({ success: false, error: 'GitHub API rate limit exceeded.' }, { status: 403 });
    }
    if (!response.ok) {
      return NextResponse.json({ success: false, error: `GitHub API error: ${response.statusText}` }, { status: response.status });
    }
    
    const data = await response.json();
    
    if (data.private) {
      return NextResponse.json({ success: false, error: 'Repository must be public.' }, { status: 400 });
    }
    
    const commitsUrl = `${apiUrl}/commits?per_page=5`;
    const commitsRes = await fetch(commitsUrl, { headers });
    
    if (!commitsRes.ok) {
      return NextResponse.json({ success: false, error: `Failed to fetch commits: ${commitsRes.statusText}` }, { status: commitsRes.status });
    }
    
    const commits = await commitsRes.json();
    const commitCount = commits.length;
    
    if (commitCount > 3) {
      return NextResponse.json({ success: false, error: `Too many commits (${commitCount}). Max 3 allowed.` }, { status: 400 });
    }
    
    const readmeUrl = `${apiUrl}/readme`;
    const readmeRes = await fetch(readmeUrl, { headers });
    let readmeText = '';
    
    if (readmeRes.ok) {
      const readmeData = await readmeRes.json();
      if (readmeData.content) {
        readmeText = Buffer.from(readmeData.content, 'base64').toString('utf-8');
      }
    } else {
      readmeText = 'No README provided by the repository.';
    }
    
    let score = 100 + ((data.stargazers_count || 0) * 10);
    let reasoning = "Calculated using GitHub stars (Gemini API Key missing).";
    
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({});
        const prompt = `Grade this hackathon project based on its README. Return a JSON object with 'score' (integer 0-100) and 'reasoning' (max 2 sentences).\n\nREADME:\n${readmeText}`;
        const aiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        score: { type: Type.INTEGER },
                        reasoning: { type: Type.STRING }
                    },
                    required: ["score", "reasoning"]
                }
            }
        });
        
        const aiResult = JSON.parse(aiResponse.text || '{}');
        if (typeof aiResult.score === 'number') score = aiResult.score;
        if (aiResult.reasoning) reasoning = aiResult.reasoning;
      } catch (err: any) {
        console.error("Gemini API Error:", err.message || err);
        reasoning = "Gemini API failed. Falling back to star-based calculation.";
      }
    }
    
    const leaderboard = await updateLeaderboard(url, score);
    
    return NextResponse.json({ success: true, score, reasoning, leaderboard });
    
  } catch (error: any) {
    console.error('API Route Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
