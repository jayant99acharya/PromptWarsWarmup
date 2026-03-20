import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  const filePath = path.join(process.cwd(), 'leaderboard.json');
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const leaderboard = JSON.parse(data);
    return NextResponse.json({ success: true, leaderboard });
  } catch (error) {
    // If file doesn't exist, return empty leaderboard
    return NextResponse.json({ success: true, leaderboard: {} });
  }
}
